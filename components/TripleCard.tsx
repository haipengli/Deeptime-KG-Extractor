
import React from 'react';
import type { Triple } from '../types';
import { FileTextIcon } from './icons';

interface TripleCardProps {
  triple: Triple;
  index: number;
}

const TripleCard: React.FC<TripleCardProps> = ({ triple, index }) => {
  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden transform hover:scale-[1.02] transition-transform duration-200">
      <div className="p-5">
        <div className="flex items-center space-x-4 mb-4">
          <span className="flex-shrink-0 bg-brand-primary text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center">{index + 1}</span>
          <div className="flex flex-col md:flex-row md:items-center md:space-x-2 text-gray-700 w-full overflow-hidden">
             <span className="font-semibold text-brand-dark bg-blue-100 px-2 py-1 rounded-md text-sm truncate" title={triple.subject}>{triple.subject}</span>
             <span className="font-mono text-brand-secondary text-xs md:text-sm truncate" title={triple.predicate}>{triple.predicate}</span>
             <span className="font-semibold text-brand-dark bg-green-100 px-2 py-1 rounded-md text-sm truncate" title={triple.object}>{triple.object}</span>
          </div>
        </div>
        <div className="border-l-4 border-brand-accent pl-4">
          <blockquote className="text-gray-600 italic">
            "{triple.evidenceText}"
          </blockquote>
        </div>
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