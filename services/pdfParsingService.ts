

import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';

// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;

interface TextItem {
    str: string;
}

const cleanText = (text: string): string => {
    return text.replace(/\s+/g, ' ').trim();
};


export const parsePdfToText = async (file: File): Promise<string> => {
    const fileBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(fileBuffer);
    const pdf = await pdfjs.getDocument(typedArray).promise;
    
    const allTextItems: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        allTextItems.push(...(textContent.items as TextItem[]).map(item => item.str));
    }
    
    return cleanText(allTextItems.join(' '));
};
