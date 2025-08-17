
import React from 'react';
import type { SchemaSuggestion } from '../types';
import { PlusCircleIcon, XIcon, CheckCircleIcon } from './icons';

interface SuggestionReviewerProps {
  suggestions: SchemaSuggestion[];
  onAccept: (suggestion: SchemaSuggestion) => void;
  onReject: (suggestion: SchemaSuggestion) => void;
}

const SuggestionReviewer: React.FC<SuggestionReviewerProps> = ({ suggestions, onAccept, onReject }) => {
  if (suggestions.length === 0) {
    return null;
  }
  
  const entitySuggestions = suggestions.filter(s => s.type === 'entity');
  const predicateSuggestions = suggestions.filter(s => s.type === 'predicate');

  return (
    <div className="mt-6">
      {entitySuggestions.length > 0 && (
        <>
            <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <div>
                <h2 className="text-xl font-bold text-brand-dark flex items-center">
                    <PlusCircleIcon className="w-6 h-6 mr-2 text-brand-accent"/>
                    AI-Suggested New Entities
                </h2>
                <p className="text-sm text-gray-600">
                    Help evolve the schema by reviewing these concept suggestions from the document.
                </p>
                </div>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {entitySuggestions.map((suggestion, index) => (
                <div key={`ent-sug-${suggestion.name}-${index}`} className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-grow">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-brand-dark">{suggestion.name}</span>
                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">{suggestion.categorySuggestion}</span>
                    </div>
                    <p className="text-sm text-gray-600 italic mt-1">"{suggestion.justification}"</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <button onClick={() => onReject(suggestion)} className="p-2 rounded-full text-gray-500 bg-white border hover:bg-gray-100 transition-colors" aria-label={`Reject ${suggestion.name}`}><XIcon className="w-5 h-5" /></button>
                        <button onClick={() => onAccept(suggestion)} className="p-2 rounded-full text-green-600 bg-green-100 border border-green-200 hover:bg-green-200 transition-colors" aria-label={`Accept ${suggestion.name}`}><CheckCircleIcon className="w-5 h-5" /></button>
                    </div>
                </div>
                ))}
            </div>
        </>
      )}

      {predicateSuggestions.length > 0 && (
         <div className="mt-8">
            <div className="flex justify-between items-center mb-4 pb-4 border-b">
                <div>
                <h2 className="text-xl font-bold text-brand-dark flex items-center">
                    <PlusCircleIcon className="w-6 h-6 mr-2 text-brand-accent"/>
                    AI-Suggested New Relationships
                </h2>
                <p className="text-sm text-gray-600">
                    Review these suggested predicates that are not in the current schema.
                </p>
                </div>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {predicateSuggestions.map((suggestion, index) => (
                <div key={`pred-sug-${suggestion.name}-${index}`} className="p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-grow">
                        <div className="font-mono text-sm mb-2">
                            <span className="font-semibold text-blue-700">{suggestion.exampleTriple?.subject || 'Subject'}</span>
                            <span className="text-red-600 font-bold mx-2">{`-> [${suggestion.name}] ->`}</span>
                            <span className="font-semibold text-green-700">{suggestion.exampleTriple?.object || 'Object'}</span>
                        </div>
                        <p className="text-sm text-gray-600 italic">"{suggestion.justification}"</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                         <button onClick={() => onReject(suggestion)} className="p-2 rounded-full text-gray-500 bg-white border hover:bg-gray-100 transition-colors" aria-label={`Reject ${suggestion.name}`}><XIcon className="w-5 h-5" /></button>
                        <button onClick={() => onAccept(suggestion)} className="p-2 rounded-full text-green-600 bg-green-100 border border-green-200 hover:bg-green-200 transition-colors" aria-label={`Accept ${suggestion.name}`}><CheckCircleIcon className="w-5 h-5" /></button>
                    </div>
                </div>
                ))}
            </div>
        </div>
      )}
    </div>
  );
};

export default SuggestionReviewer;