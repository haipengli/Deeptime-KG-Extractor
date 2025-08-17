
import React from 'react';
import type { LlmConfig } from '../types';
import { XIcon, KeyIcon, ServerIcon, InfoIcon } from './icons';

interface SettingsModalProps {
  config: LlmConfig;
  onConfigChange: (newConfig: LlmConfig) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ config, onConfigChange, onClose }) => {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onConfigChange({ ...config, [e.target.name]: e.target.value });
  };
  
  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onConfigChange({ ...config, temperature: parseFloat(e.target.value) });
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
          <XIcon className="w-6 h-6" />
        </button>
        <h2 className="text-2xl font-bold text-brand-dark mb-4">LLM Configuration</h2>
        
        <div className="space-y-6">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-semibold text-gray-700 mb-1 flex items-center">
              <KeyIcon className="w-4 h-4 mr-2" /> API Key
            </label>
            <input
              type="password"
              id="apiKey"
              name="apiKey"
              value={config.apiKey}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-accent focus:border-brand-accent"
              placeholder="Enter your API Key"
            />
             <p className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded-md">Your key is stored in your browser's local storage and is not sent anywhere except to the configured LLM provider.</p>
          </div>

          <div>
            <label htmlFor="provider" className="block text-sm font-semibold text-gray-700 mb-1 flex items-center">
              <ServerIcon className="w-4 h-4 mr-2" /> Provider
            </label>
            <select
              id="provider"
              name="provider"
              value={config.provider}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-accent focus:border-brand-accent bg-white"
            >
              <option value="gemini">Gemini</option>
              <option value="openai" disabled>OpenAI (coming soon)</option>
              <option value="anthropic" disabled>Anthropic (coming soon)</option>
            </select>
          </div>

          <div>
            <label htmlFor="model" className="block text-sm font-semibold text-gray-700 mb-1 flex items-center">
              <ServerIcon className="w-4 h-4 mr-2" /> Model Name
            </label>
             <input
              type="text"
              id="model"
              name="model"
              value={config.model}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-accent focus:border-brand-accent"
              placeholder="e.g., gemini-2.5-flash"
            />
            <p className="text-xs text-gray-500 mt-1">For Gemini, `gemini-2.5-flash` is recommended.</p>
          </div>

          <div>
            <label htmlFor="temperature" className="block text-sm font-semibold text-gray-700 mb-1">
              Temperature: <span className="font-bold text-brand-primary">{config.temperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              id="temperature"
              name="temperature"
              min="0"
              max="1"
              step="0.05"
              value={config.temperature}
              onChange={handleRangeChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>More Precise</span>
              <span>More Creative</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t">
          <button
            onClick={onClose}
            className="w-full bg-brand-primary text-white font-bold py-2 px-4 rounded-md hover:bg-brand-secondary transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;