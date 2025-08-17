

import React from 'react';
import type { Triple } from '../types';
import { FileTextIcon, InfoIcon } from './icons';

interface TripleCardProps {
  triple: Triple;
  index: number;
  subjectType?: string;
  objectType?: string;
}

const getConfidenceColor = (score: number) => {
    if (score > 0.9) return 'bg-green-100 text-green-800';
    if (score > 0.7) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
}

const TripleCard: React.FC<TripleCardProps> = ({ triple, index, subjectType, objectType }) => {
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden transform hover:scale-[1.01] transition-transform duration-200">
      <div className="p-5">
        <div className="flex items-start md:items-center space-x-4 mb-4">
          <span className="flex-shrink-0 bg-brand-primary text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center mt-1 md:mt-0">{index + 1}</span>
          <div className="flex-grow flex flex-col md:flex-row md:items-center md:space-x-2 text-gray-700 w-full overflow-hidden">
             <div className="flex flex-col items-start bg-blue-100 px-2 py-1 rounded-md">
                <span className="font-semibold text-brand-dark text-sm truncate" title={triple.subject}>{triple.subject}</span>
                {subjectType && <span className="text-xs font-mono text-blue-800">{subjectType}</span>}
             </div>
             <span className="font-mono text-brand-secondary text-xs md:text-sm truncate" title={triple.predicate}>{triple.predicate}</span>
             <div className="flex flex-col items-start bg-green-100 px-2 py-1 rounded-md">
                <span className="font-semibold text-brand-dark text-sm truncate" title={triple.object}>{triple.object}</span>
                {objectType && <span className="text-xs font-mono text-green-800">{objectType}</span>}
             </div>
          </div>
          {triple.confidence !== undefined && (
            <div className={`text-xs font-bold px-2 py-1 rounded-full ${getConfidenceColor(triple.confidence)}`}>
              {(triple.confidence * 100).toFixed(0)}%
            </div>
          )}
        </div>
        <div className="border-l-4 border-brand-accent pl-4 mb-3">
          <blockquote className="text-gray-600 italic">
            "{triple.evidenceText}"
          </blockquote>
        </div>
        {triple.justification && (
            <div className="pl-4 flex items-start text-xs text-gray-500 bg-gray-50 p-2 rounded-md">
                <InfoIcon className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-gray-400" />
                <p><span className="font-semibold">Justification:</span> {triple.justification}</p>
            </div>
        )}
      </div>
      <div className="bg-gray-50 px-5 py-2 border-t">
        <div className="flex items-center space-x-2 text-xs text-gray-500">
            <FileTextIcon className="w-4 h-4" />
            <span className="font-mono truncate" title={triple.source}>Source: {triple.source}</span>
        </div>
      </div>
    </div>
  );
};

export default TripleCard;