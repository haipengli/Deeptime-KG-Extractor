import React, { useState } from 'react';
import type { PromptCollection, Prompt } from '../types';
import { ChevronDownIcon, SaveIcon, ResetIcon, InfoIcon } from './icons';

interface PromptManagerProps {
    prompts: PromptCollection;
    onPromptsChange: (newPrompts: PromptCollection) => void;
}

const PromptEditor: React.FC<{ prompt: Prompt; onSave: (newTemplate: string) => void; onVersionChange: (version: number) => void }> = ({ prompt, onSave, onVersionChange }) => {
    const activeVersionData = prompt.versions.find(v => v.version === prompt.activeVersion);
    const [template, setTemplate] = useState(activeVersionData?.template || '');
    const [isDirty, setIsDirty] = useState(false);

    React.useEffect(() => {
        const currentVersionData = prompt.versions.find(v => v.version === prompt.activeVersion);
        setTemplate(currentVersionData?.template || '');
        setIsDirty(false);
    }, [prompt.activeVersion, prompt.versions]);
    
    const handleTemplateChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setTemplate(e.target.value);
        const currentVersionData = prompt.versions.find(v => v.version === prompt.activeVersion);
        setIsDirty(e.target.value !== currentVersionData?.template);
    }
    
    const handleSave = () => {
        onSave(template);
        setIsDirty(false);
    }

    return (
        <div className="p-4 bg-gray-50 border-t">
            <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                    <label htmlFor={`version-${prompt.name}`} className="text-sm font-semibold text-gray-700">Active Version:</label>
                    <select
                        id={`version-${prompt.name}`}
                        value={prompt.activeVersion}
                        onChange={(e) => onVersionChange(parseInt(e.target.value))}
                        className="text-sm border-gray-300 rounded-md"
                    >
                        {prompt.versions.map(v => (
                            <option key={v.version} value={v.version}>
                                Version {v.version} ({new Date(v.date).toLocaleDateString()})
                            </option>
                        ))}
                    </select>
                </div>
                 <button 
                    onClick={handleSave} 
                    disabled={!isDirty}
                    className="flex items-center gap-2 text-sm font-semibold py-1 px-3 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                    <SaveIcon className="w-4 h-4" /> Save as New Version
                </button>
            </div>
             <textarea
                value={template}
                onChange={handleTemplateChange}
                className="w-full h-64 p-2 font-mono text-sm border border-gray-300 rounded-md focus:ring-brand-accent focus:border-brand-accent"
             />
             <div className="mt-2 text-xs text-gray-500 bg-blue-50 p-2 rounded-md flex items-start">
                <InfoIcon className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-blue-500" />
                <span>{'Placeholders like `{{variable_name}}` are filled in automatically during processing. Editing these may break functionality if the code expects them.'}</span>
             </div>
        </div>
    );
};

const PromptManager: React.FC<PromptManagerProps> = ({ prompts, onPromptsChange }) => {
    const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});

    const togglePrompt = (key: string) => {
        setExpandedPrompts(prev => ({...prev, [key]: !prev[key]}));
    };
    
    const handleSavePrompt = (key: string, newTemplate: string) => {
        const newPrompts = JSON.parse(JSON.stringify(prompts));
        const prompt = newPrompts[key];
        const newVersionNumber = Math.max(...prompt.versions.map((v: any) => v.version)) + 1;
        prompt.versions.push({
            version: newVersionNumber,
            template: newTemplate,
            date: new Date().toISOString(),
        });
        prompt.activeVersion = newVersionNumber;
        onPromptsChange(newPrompts);
    };

    const handleVersionChange = (key: string, version: number) => {
        const newPrompts = { ...prompts, [key]: { ...prompts[key], activeVersion: version } };
        onPromptsChange(newPrompts);
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
            <h2 className="text-2xl font-bold text-brand-dark mb-1">Prompt Manager</h2>
            <p className="text-sm text-gray-600 mb-4">View and customize the prompts used by the AI. Changes are saved locally to your browser.</p>
            <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2">
                {Object.entries(prompts).map(([key, prompt]) => (
                    <div key={key} className="border rounded-md overflow-hidden">
                        <button onClick={() => togglePrompt(key)} className="w-full flex justify-between items-center text-left p-4 bg-gray-100 hover:bg-gray-200">
                            <div>
                                <h3 className="font-bold text-brand-primary">{prompt.name}</h3>
                                <p className="text-xs text-gray-600">{prompt.description}</p>
                            </div>
                            <ChevronDownIcon className={`w-5 h-5 transition-transform ${expandedPrompts[key] ? 'rotate-180' : ''}`} />
                        </button>
                        {expandedPrompts[key] && (
                            <PromptEditor 
                                prompt={prompt}
                                onSave={(newTemplate) => handleSavePrompt(key, newTemplate)}
                                onVersionChange={(version) => handleVersionChange(key, version)}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PromptManager;