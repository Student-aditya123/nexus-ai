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
      const sentences = this._splitIntoSentences(page.text);
      const pageChunks = this._createOverlappingChunks(sentences, page.pageNum);

      pageChunks.forEach(chunk => {
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

    const data = await pdfParse(buffer, {
      pagerender: (pageData) => {
        return pageData.getTextContent().then((textContent) => {
          return textContent.items.map(item => item.str).join(' ');
        });
      },
    });

    // Parse per-page
    const pages = [];
    const rawText = data.text;
    const avgCharsPerPage = Math.ceil(rawText.length / (data.numpages || 1));

    for (let i = 0; i < data.numpages; i++) {
      const start = i * avgCharsPerPage;
      const end = start + avgCharsPerPage;
      const pageText = rawText.slice(start, end).trim();

      if (pageText.length > 50) {
        pages.push({
          pageNum: i + 1,
          text: this._cleanText(pageText),
        });
      }
    }

    return {
      pages,
      metadata: {
        filename,
        type: 'pdf',
        pageCount: data.numpages,
        wordCount: this._countWords(rawText),
        info: data.info,
      },
    };
  }

  async _extractDOCX(buffer, filename) {
    const mammoth = require('mammoth');

    const result = await mammoth.extractRawText({ buffer });
    const text = this._cleanText(result.value);

    // Split by paragraphs/sections
    const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 20);
    const chunkSize = 3; // paragraphs per "page"

    const pages = [];
    for (let i = 0; i < paragraphs.length; i += chunkSize) {
      const pageText = paragraphs.slice(i, i + chunkSize).join('\n\n');
      pages.push({
        pageNum: Math.floor(i / chunkSize) + 1,
        text: pageText,
      });
    }

    return {
      pages,
      metadata: {
        filename,
        type: 'docx',
        pageCount: pages.length,
        wordCount: this._countWords(text),
        messages: result.messages,
      },
    };
  }

  async _extractPPTX(buffer, filename) {
    // Basic PPTX extraction - in production use officegen or libreoffice
    // Parsing PPTX XML manually
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

        if (text.length > 10) {
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
      // Fallback: treat as text
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
        pageCount: pages.length,
        wordCount: this._countWords(text),
      },
    };
  }

  // ─── Text Processing ─────────────────────────────────────────────────────────

  _cleanText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{3,}/g, '  ')
      .trim();
  }

  _splitIntoSentences(text) {
    return text
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
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
      const words = sentence.split(/\s+/);

      if (currentWordCount + words.length > wordsPerChunk && currentChunk.length > 0) {
        const text = currentChunk.join(' ');
        chunks.push({
          text,
          pageNum,
          charStart: chunkCharStart,
          charEnd: chunkCharStart + text.length,
        });

        // Keep overlap
        const overlapSentences = [];
        let overlapCount = 0;
        for (let i = currentChunk.length - 1; i >= 0 && overlapCount < overlapWords; i--) {
          const sentWords = currentChunk[i].split(/\s+/).length;
          overlapCount += sentWords;
          overlapSentences.unshift(currentChunk[i]);
        }

        currentChunk = overlapSentences;
        currentWordCount = overlapSentences.join(' ').split(/\s+/).length;
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

  /**
   * Generate a quick preview/summary of document content
   */
  generatePreview(pages, maxChars = 500) {
    const text = pages.slice(0, 3).map(p => p.text).join(' ');
    return text.slice(0, maxChars) + (text.length > maxChars ? '...' : '');
  }
}

module.exports = new DocumentProcessor();
