import { Document, Paragraph, TextRun, Packer } from 'docx';

const MIME_TYPES = {
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  TXT: 'text/plain',
} as const;

/**
 * Converts test case content to a DOCX format
 * @param testCasesContent - The test case content to export
 * @returns A Promise resolving to a Blob containing the DOCX file
 * @throws Error if the document generation fails
 */
export async function exportToDocx(testCasesContent: string): Promise<Blob> {
  try {
    if (!testCasesContent?.trim()) {
      throw new Error('Content cannot be empty');
    }

    const lines = testCasesContent.split('\n').filter(Boolean);
    
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: lines.map(line => 
            new Paragraph({
              children: [new TextRun(line.trim())],
            })
          ),
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    return new Blob([blob], { type: MIME_TYPES.DOCX });
  } catch (error) {
    throw new Error(`Failed to export to DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Converts test case content to a plain text format
 * @param testCasesContent - The test case content to export
 * @returns A Blob containing the text file
 * @throws Error if content is invalid
 */
export function exportToTxt(testCasesContent: string): Blob {
  if (!testCasesContent?.trim()) {
    throw new Error('Content cannot be empty');
  }

  return new Blob([testCasesContent], { type: MIME_TYPES.TXT });
}
