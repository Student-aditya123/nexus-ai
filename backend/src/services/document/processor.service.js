/**
 * NEXUS AI - Document Processing Service
 * Handles PDF, DOCX, PPT extraction with intelligent chunking
 * Production-grade text extraction and preprocessing pipeline
 */

'use strict';

const path = require('path');
const logger = require('../../utils/logger');
const { AppError } = require('../../utils/errors');

class DocumentProcessor {
  constructor() {
    this.chunkSize = 512;      // tokens per chunk
    this.chunkOverlap = 64;    // overlapping tokens for context preservation
    this.supportedTypes = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md'];
  }

  /**
   * Main entry point: extract text from any supported file
   * @param {Buffer} fileBuffer - Raw file buffer
   * @param {string} filename - Original filename
   * @returns {Promise<{pages: Array, metadata: Object}>}
   */
  async extractText(fileBuffer, filename) {
    const ext = path.extname(filename).toLowerCase();

    if (!this.supportedTypes.includes(ext)) {
      throw new AppError(`Unsupported file type: ${ext}`, 400);
    }

    logger.info(`Processing document: ${filename} (${ext})`);

    try {
      switch (ext) {
        case '.pdf':
          return await this._extractPDF(fileBuffer, filename);
        case '.docx':
        case '.doc':
          return await this._extractDOCX(fileBuffer, filename);
        case '.pptx':
        case '.ppt':
          return await this._extractPPTX(fileBuffer, filename);
        case '.txt':
        case '.md':
          return this._extractText(fileBuffer, filename);
        default:
          throw new AppError(`Unsupported type: ${ext}`, 400);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Document extraction failed: ${error.message}`, 500);
    }
  }

  /**
   * Split extracted pages into overlapping chunks for RAG
   * @param {Array} pages - [{pageNum, text}]
   * @param {Object} docMetadata - Document metadata
   * @returns {Array} chunks - [{text, metadata}]
   */
  createChunks(pages, docMetadata) {
    const chunks = [];

    for (const page of pages) {
      if (!page.text || !page.text.trim()) continue;

      const sentences = this._splitIntoSentences(page.text);
      let pageChunks = this._createOverlappingChunks(sentences, page.pageNum);

      // Fallback: use full page text if overlapping chunking yielded zero chunks
      if (pageChunks.length === 0) {
        pageChunks = [{
          text: page.text.trim(),
          pageNum: page.pageNum,
          charStart: 0,
          charEnd: page.text.trim().length,
        }];
      }

      pageChunks.forEach(chunk => {
        if (!chunk.text || !chunk.text.trim()) return;

        chunks.push({
          text: chunk.text,
          metadata: {
            ...docMetadata,
            page: chunk.pageNum,
            chunkIndex: chunks.length,
            charStart: chunk.charStart,
            charEnd: chunk.charEnd,
          },
        });
      });
    }

    logger.info(`Created ${chunks.length} chunks from ${pages.length} pages`);
    return chunks;
  }

  // ─── Extractors ──────────────────────────────────────────────────────────────

  async _extractPDF(buffer, filename) {
    const pdfParse = require('pdf-parse');
    const pageTexts = [];

    const data = await pdfParse(buffer, {
      pagerender: (pageData) => {
        return pageData.getTextContent().then((textContent) => {
          const text = textContent.items.map(item => item.str).join(' ');
          pageTexts.push(text);
          return text;
        });
      },
    });

    const pages = [];
    if (pageTexts.length > 0) {
      pageTexts.forEach((text, i) => {
        const cleaned = this._cleanText(text);
        if (cleaned.length > 0) {
          pages.push({ pageNum: i + 1, text: cleaned });
        }
      });
    }

    // Fallback if pagerender yielded no separate page texts
    if (pages.length === 0 && data.text) {
      const cleaned = this._cleanText(data.text);
      if (cleaned.length > 0) {
        pages.push({ pageNum: 1, text: cleaned });
      }
    }

    return {
      pages,
      metadata: {
        filename,
        type: 'pdf',
        pageCount: data.numpages || pages.length,
        wordCount: this._countWords(data.text || ''),
        info: data.info,
      },
    };
  }

  async _extractDOCX(buffer, filename) {
    const mammoth = require('mammoth');

    const result = await mammoth.extractRawText({ buffer });
    const text = this._cleanText(result.value);

    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);
    const chunkSize = 3;

    const pages = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const pageText = paragraphs.slice(i, i + chunkSize).join('\n\n');
      pages.push({
        pageNum: Math.floor(i / chunkSize) + 1,
        text: pageText,
      });
    }

    return {
      pages: pages.length ? pages : [{ pageNum: 1, text }],
      metadata: {
        filename,
        type: 'docx',
        pageCount: pages.length || 1,
        wordCount: this._countWords(text),
        messages: result.messages,
      },
    };
  }

  async _extractPPTX(buffer, filename) {
    const AdmZip = require('adm-zip');

    try {
      const zip = new AdmZip(buffer);
      const slideFiles = zip.getEntries()
        .filter(e => e.entryName.match(/ppt\/slides\/slide\d+\.xml/))
        .sort((a, b) => {
          const numA = parseInt(a.entryName.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.entryName.match(/\d+/)?.[0] || '0');
          return numA - numB;
        });

      const pages = [];

      for (let i = 0; i < slideFiles.length; i++) {
        const xml = slideFiles[i].getData().toString('utf8');
        const text = xml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (text.length > 0) {
          pages.push({
            pageNum: i + 1,
            text: this._cleanText(text),
          });
        }
      }

      return {
        pages,
        metadata: {
          filename,
          type: 'pptx',
          pageCount: slideFiles.length,
          wordCount: pages.reduce((acc, p) => acc + this._countWords(p.text), 0),
        },
      };
    } catch (err) {
      return this._extractText(buffer, filename);
    }
  }

  _extractText(buffer, filename) {
    const text = buffer.toString('utf-8');
    const paragraphs = text.split(/\n{2,}/);
    const chunkSize = 5;

    const pages = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      pages.push({
        pageNum: Math.floor(i / chunkSize) + 1,
        text: this._cleanText(paragraphs.slice(i, i + chunkSize).join('\n\n')),
      });
    }

    return {
      pages: pages.length ? pages : [{ pageNum: 1, text: this._cleanText(text) }],
      metadata: {
        filename,
        type: 'text',
        pageCount: pages.length || 1,
        wordCount: this._countWords(text),
      },
    };
  }

  // ─── Text Processing ─────────────────────────────────────────────────────────

  _cleanText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{3,}/g, ' ')
      .trim();
  }

  _splitIntoSentences(text) {
    if (!text) return [];
    const items = text
      .split(/(?<=[.!?])\s+|\n+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return items.length > 0 ? items : [text.trim()];
  }

  _createOverlappingChunks(sentences, pageNum) {
    const chunks = [];
    const wordsPerChunk = this.chunkSize;
    const overlapWords = this.chunkOverlap;

    let currentChunk = [];
    let currentWordCount = 0;
    let charStart = 0;
    let chunkCharStart = 0;

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).filter(Boolean);

      if (currentWordCount + words.length > wordsPerChunk && currentChunk.length > 0) {
        const text = currentChunk.join(' ');
        chunks.push({
          text,
          pageNum,
          charStart: chunkCharStart,
          charEnd: chunkCharStart + text.length,
        });

        const overlapSentences = [];
        let overlapCount = 0;
        for (let i = currentChunk.length - 1; i >= 0 && overlapCount < overlapWords; i--) {
          const sentWords = currentChunk[i].split(/\s+/).filter(Boolean).length;
          overlapCount += sentWords;
          overlapSentences.unshift(currentChunk[i]);
        }

        currentChunk = overlapSentences;
        currentWordCount = overlapSentences.join(' ').split(/\s+/).filter(Boolean).length;
        chunkCharStart = charStart - overlapSentences.join(' ').length;
      }

      currentChunk.push(sentence);
      currentWordCount += words.length;
      charStart += sentence.length + 1;
    }

    if (currentChunk.length > 0) {
      const text = currentChunk.join(' ');
      chunks.push({
        text,
        pageNum,
        charStart: chunkCharStart,
        charEnd: chunkCharStart + text.length,
      });
    }

    return chunks;
  }

  _countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  generatePreview(pages, maxChars = 500) {
    const text = pages.slice(0, 3).map(p => p.text).join(' ');
    return text.slice(0, maxChars) + (text.length > maxChars ? '...' : '');
  }
}

module.exports = new DocumentProcessor();