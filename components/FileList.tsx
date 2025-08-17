import React, { useState } from 'react';
import { FileIcon, TrashIcon, LoaderIcon, CheckCircleIcon, AlertTriangleIcon, ClockIcon, CheckboxCheckedIcon, CheckboxUncheckedIcon, DatabaseIcon, ChevronDownIcon, ChevronRightIcon } from './icons';
import type { ExtractionStep, DocumentSection } from '../types';

interface ManagedFile {
    name: string;
    sections: DocumentSection[];
    status: { step: ExtractionStep; message?: string };
}

interface FileListProps {
  files: ManagedFile[];
  selectedFiles: Set<string>;
  onFileSelectionChange: (fileName: string, selected: boolean) => void;
  onSectionSelectionChange: (fileName: string, sectionIndex: number, selected: boolean) => void;
  onDeleteFile: (fileName: string) => void;
}

const StatusIndicator: React.FC<{ status: { step: ExtractionStep; message?: string } }> = ({ status }) => {
    const { step, message } = status;

    const getStatusContent = () => {
        switch (step) {
            case 'cached':
                return { icon: <DatabaseIcon className="w-4 h-4 text-purple-500" />, text: 'Cached', color: 'text-purple-600' };
            case 'queued':
                return { icon: <ClockIcon className="w-4 h-4 text-gray-500" />, text: 'Queued', color: 'text-gray-600' };
            case 'parsing':
            case 'extractingEntities':
            case 'extractingRelationships':
                return { icon: <LoaderIcon className="w-4 h-4 text-blue-500 animate-spin" />, text: 'Processing...', color: 'text-blue-600' };
            case 'awaitingReview':
                 return { icon: <CheckCircleIcon className="w-4 h-4 text-yellow-600" />, text: 'Ready for Review', color: 'text-yellow-700' };
            case 'complete':
                return { icon: <CheckCircleIcon className="w-4 h-4 text-green-500" />, text: 'Complete', color: 'text-green-600' };
            case 'error':
                return { icon: <AlertTriangleIcon className="w-4 h-4 text-red-500" />, text: 'Error', color: 'text-red-600' };
            default:
                return null;
        }
    };

    const content = getStatusContent();
    if (!content) return null;

    return (
        <div className={`flex items-center space-x-1 text-xs font-semibold ${content.color}`} title={message || content.text}>
            {content.icon}
            <span className="hidden sm:inline">{content.text}</span>
        </div>
    );
};

const FileList: React.FC<FileListProps> = ({ files, selectedFiles, onFileSelectionChange, onSectionSelectionChange, onDeleteFile }) => {
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

    const toggleFileExpansion = (fileName: string) => {
        setExpandedFiles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileName)) {
                newSet.delete(fileName);
            } else {
                newSet.add(fileName);
            }
            return newSet;
        });
    };
    
    if (files.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-700 px-1">Uploaded Documents ({files.length})</h3>
            <div className="space-y-1 flex-grow overflow-y-auto pr-1">
            {files.map((file) => {
                const isSelected = selectedFiles.has(file.name);
                const isExpanded = expandedFiles.has(file.name);
                const isProcessing = ['queued', 'parsing', 'extractingEntities', 'extractingRelationships'].includes(file.status.step);

                return (
                    <div key={file.name} className="bg-white border border-gray-200 rounded-md">
                        <div className={`group flex items-center justify-between w-full text-left p-2 transition-colors duration-150`}>
                            <div className="flex items-center space-x-2 overflow-hidden flex-grow">
                                <button onClick={() => !isProcessing && onFileSelectionChange(file.name, !isSelected)} disabled={isProcessing} className={isProcessing ? 'cursor-not-allowed' : 'cursor-pointer'}>
                                    {isSelected ? <CheckboxCheckedIcon className="w-5 h-5 text-brand-primary flex-shrink-0"/> : <CheckboxUncheckedIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                                </button>
                                <button onClick={() => toggleFileExpansion(file.name)} className="p-1 rounded-full hover:bg-gray-200">
                                    {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                </button>
                                <FileIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                                <span className="text-sm truncate font-medium text-gray-800" title={file.name}>{file.name}</span>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
                                <StatusIndicator status={file.status}/>
                                <button onClick={(e) => { e.stopPropagation(); onDeleteFile(file.name); }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 rounded-full transition-all" aria-label={`Delete ${file.name}`}>
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="pl-12 pr-4 pb-2 pt-1 border-t border-gray-200 space-y-1">
                                {file.sections.length > 0 ? file.sections.map((section, index) => (
                                    <div key={index} className="flex items-center">
                                        <button onClick={() => onSectionSelectionChange(file.name, index, !section.selected)} className="flex items-center space-x-2 w-full text-left p-1 rounded-md hover:bg-gray-100">
                                            {section.selected ? <CheckboxCheckedIcon className="w-5 h-5 text-brand-secondary flex-shrink-0"/> : <CheckboxUncheckedIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />}
                                            <span className="text-xs truncate text-gray-800" title={section.title}>{section.title}</span>
                                        </button>
                                    </div>
                                )) : (
                                    <p className="text-xs text-gray-500 italic">No sections found by local parser.</p>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}
            </div>
        </div>
    );
};

export default FileList;