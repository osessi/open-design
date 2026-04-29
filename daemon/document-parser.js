// Document parsing utilities for PPTX and Word files.
// Extracts text, images, and structure from Office documents.

import mammoth from 'mammoth';
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sanitizeName } from './projects.js';

// Size limit for document uploads (10MB)
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

// Supported document MIME types
export const DOCUMENT_MIMES = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
};

export function isDocumentFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext in DOCUMENT_MIMES;
}

/**
 * Parse a Word document (.docx or .doc) and extract content.
 * Returns: { text, images: [{name, buffer, mimeType}], metadata }
 */
export async function parseWordDocument(filePath) {
  try {
    const buffer = await readFile(filePath);
    
    // Use mammoth to extract text and images
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const imageBuffer = await image.read();
          const ext = image.contentType.split('/')[1] || 'png';
          const imageName = `extracted-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          
          return {
            src: imageName,
            buffer: imageBuffer,
            contentType: image.contentType,
          };
        }),
      }
    );

    // Extract plain text from HTML
    const text = result.value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Collect extracted images
    const images = [];
    if (result.messages) {
      for (const msg of result.messages) {
        if (msg.type === 'image' && msg.buffer) {
          images.push({
            name: msg.src,
            buffer: msg.buffer,
            mimeType: msg.contentType || 'image/png',
          });
        }
      }
    }

    return {
      text,
      html: result.value,
      images,
      metadata: {
        type: 'word',
        paragraphs: text.split(/\n\n+/).filter(Boolean).length,
        wordCount: text.split(/\s+/).length,
      },
    };
  } catch (err) {
    throw new Error(`Failed to parse Word document: ${err.message}`);
  }
}

/**
 * Parse a PowerPoint document (.pptx) and extract content.
 * Returns: { text, images: [{name, buffer, mimeType}], slides: [...], metadata }
 */
export async function parsePowerPointDocument(filePath) {
  try {
    const buffer = await readFile(filePath);
    const zip = await JSZip.loadAsync(buffer);
    
    const slides = [];
    const images = [];
    const slideTexts = [];
    
    // Extract slide XML files
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
      .sort();
    
    for (const slideFile of slideFiles) {
      const content = await zip.files[slideFile].async('string');
      
      // Extract text from slide XML (basic extraction)
      // PPTX stores text in <a:t> tags within drawing elements
      const textMatches = content.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || [];
      const slideText = textMatches
        .map(match => match.replace(/<a:t[^>]*>|<\/a:t>/g, ''))
        .filter(Boolean)
        .join('\n');
      
      if (slideText.trim()) {
        slides.push({
          number: slides.length + 1,
          text: slideText.trim(),
        });
        slideTexts.push(slideText.trim());
      }
    }
    
    // Extract images from media folder
    const imageFiles = Object.keys(zip.files)
      .filter(name => name.startsWith('ppt/media/') && /\.(png|jpe?g|gif|bmp)$/i.test(name));
    
    for (const imageFile of imageFiles) {
      const imageBuffer = await zip.files[imageFile].async('nodebuffer');
      const ext = path.extname(imageFile);
      const basename = path.basename(imageFile, ext);
      const imageName = sanitizeName(`${basename}-${Date.now()}${ext}`);
      
      const mimeType = ext === '.png' ? 'image/png' :
                       ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                       ext === '.gif' ? 'image/gif' :
                       ext === '.bmp' ? 'image/bmp' : 'image/png';
      
      images.push({
        name: imageName,
        buffer: imageBuffer,
        mimeType,
      });
    }
    
    const fullText = slideTexts.join('\n\n');
    
    return {
      text: fullText,
      slides,
      images,
      metadata: {
        type: 'powerpoint',
        slideCount: slides.length,
        wordCount: fullText.split(/\s+/).length,
      },
    };
  } catch (err) {
    throw new Error(`Failed to parse PowerPoint document: ${err.message}`);
  }
}

/**
 * Parse any supported document type and extract content.
 * Saves extracted content to the project directory.
 * Returns: { summary, extractedFiles: [{name, path, type}] }
 */
export async function parseDocument(filePath, projectDir) {
  const ext = path.extname(filePath).toLowerCase();
  let parsed;
  
  if (ext === '.docx' || ext === '.doc') {
    parsed = await parseWordDocument(filePath);
  } else if (ext === '.pptx' || ext === '.ppt') {
    parsed = await parsePowerPointDocument(filePath);
  } else {
    throw new Error(`Unsupported document type: ${ext}`);
  }
  
  const extractedFiles = [];
  
  // Save extracted text as a reference file
  const textFileName = sanitizeName(`${path.basename(filePath, ext)}-extracted-text.txt`);
  const textFilePath = path.join(projectDir, textFileName);
  await writeFile(textFilePath, parsed.text, 'utf-8');
  extractedFiles.push({
    name: textFileName,
    path: textFileName,
    type: 'text',
  });
  
  // Save extracted images
  for (const img of parsed.images) {
    const imgPath = path.join(projectDir, img.name);
    await writeFile(imgPath, img.buffer);
    extractedFiles.push({
      name: img.name,
      path: img.name,
      type: 'image',
    });
  }
  
  // Create a summary with metadata
  const summary = {
    originalFile: path.basename(filePath),
    documentType: parsed.metadata.type,
    extractedText: parsed.text.slice(0, 500) + (parsed.text.length > 500 ? '...' : ''),
    stats: parsed.metadata,
    extractedFiles: extractedFiles.map(f => f.name),
  };
  
  return {
    summary,
    extractedFiles,
    fullText: parsed.text,
  };
}

/**
 * Validate document file before upload.
 * Checks file size and type.
 */
export function validateDocument(file) {
  const errors = [];
  
  if (!file || !file.originalname) {
    errors.push('Invalid file object');
    return { valid: false, errors };
  }
  
  const ext = path.extname(file.originalname).toLowerCase();
  if (!isDocumentFile(file.originalname)) {
    errors.push(`Unsupported document type: ${ext}. Supported: .docx, .doc, .pptx, .ppt`);
  }
  
  if (file.size > MAX_DOCUMENT_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    errors.push(`File too large: ${sizeMB}MB (max: 10MB)`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
