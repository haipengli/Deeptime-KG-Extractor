
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import type { DocumentSection } from '../types';

// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjs.version}/build/pdf.worker.mjs`;

const COMMON_HEADINGS = [
    'abstract', 'introduction', 'background', 'related work', 'methodology', 'methods',
    'materials and methods', 'experimental setup', 'results', 'findings',
    'discussion', 'interpretation', 'conclusion', 'summary', 'future work',
    'acknowledgements', 'references', 'appendix'
];

interface TextItem {
    str: string;
    transform: number[];
    height: number;
}

const isHeading = (item: TextItem, avgHeight: number): boolean => {
    const fontSize = item.transform[3];
    return fontSize > avgHeight * 1.15;
};

const cleanText = (text: string): string => {
    return text.replace(/\s+/g, ' ').trim();
};


export const parsePdfToSections = async (file: File): Promise<DocumentSection[]> => {
    const fileBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(fileBuffer);
    const pdf = await pdfjs.getDocument(typedArray).promise;

    const sections: DocumentSection[] = [];
    let currentSectionContent: string[] = [];
    let currentTitle = "Introduction"; // Default for text before the first heading
    let allTextItems: TextItem[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        allTextItems.push(...textContent.items as TextItem[]);
    }
    
    if (allTextItems.length === 0) {
        return [{ title: 'Full Text', content: '', selected: true }];
    }

    const totalHeight = allTextItems.reduce((sum, item) => sum + item.height, 0);
    const avgHeight = totalHeight / allTextItems.length;

    allTextItems.forEach(item => {
        const text = item.str.trim();
        if (!text) return;

        const cleanedLowerText = text.toLowerCase().replace(/[^a-z\s]/g, '');
        
        const isPotentialHeading = isHeading(item, avgHeight) || (text.length < 50 && COMMON_HEADINGS.includes(cleanedLowerText));

        if (isPotentialHeading) {
            if (currentSectionContent.length > 0) {
                sections.push({
                    title: currentTitle,
                    content: cleanText(currentSectionContent.join(' ')),
                    selected: true
                });
            }
            currentTitle = text;
            currentSectionContent = [];
        } else {
            currentSectionContent.push(item.str);
        }
    });

    if (currentSectionContent.length > 0) {
        sections.push({
            title: currentTitle,
            content: cleanText(currentSectionContent.join(' ')),
            selected: true
        });
    }

    if (sections.length === 0) {
        const fullText = allTextItems.map(item => item.str).join(' ');
        return [{ title: 'Full Text', content: cleanText(fullText), selected: true }];
    }

    return sections;
};
