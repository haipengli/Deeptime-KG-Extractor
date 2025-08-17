import React from 'react';
import type { SchemaProposal } from '../types';
import { PlusCircleIcon, XIcon, CheckCircleIcon, BrainCircuitIcon } from './icons';

interface SchemaProposalReviewerProps {
  proposals: SchemaProposal[];
  onAccept: (proposal: SchemaProposal) => void;
  onReject: (proposal: SchemaProposal) => void;
}

const SchemaProposalReviewer: React.FC<SchemaProposalReviewerProps> = ({ proposals, onAccept, onReject }) => {
  if (proposals.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <div className="flex justify-between items-center mb-4 pb-4 border-b">
        <div>
          <h2 className="text-xl font-bold text-brand-dark flex items-center">
            <BrainCircuitIcon className="w-6 h-6 mr-2 text-brand-accent" />
            AI-Suggested Schema Extensions
          </h2>
          <p className="text-sm text-gray-600">
            The AI entered "Automated Mode" and proposed these additions to the schema based on the document's content.
          </p>
        </div>
      </div>
      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
        {proposals.map((proposal) => (
          <div key={proposal.id} className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            {proposal.new_types.map(nt => (
              <div key={nt.name} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">NEW ENTITY TYPE</span>
                    <span className="font-bold text-brand-dark">{nt.name}</span>
                  </div>
                  <p className="text-sm text-gray-600 italic mt-1">"{nt.definition}"</p>
                  <p className="text-xs text-gray-500 mt-1">Examples: {nt.examples.join(', ')}</p>
                </div>
              </div>
            ))}
            {proposal.new_predicates.map(np => (
              <div key={np.name} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-grow">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-semibold">NEW PREDICATE</span>
                     <span className="font-bold text-brand-dark">{np.name}</span>
                  </div>
                   <p className="text-sm text-gray-600 italic mt-1">"{np.description}"</p>
                   <p className="text-xs text-gray-500 mt-1">Example: {np.example.subject} -&gt; {np.example.object}</p>
                </div>
              </div>
            ))}
             <div className="flex-shrink-0 flex items-center gap-2 mt-3 pt-3 border-t border-yellow-300 justify-end">
                <button onClick={() => onReject(proposal)} className="flex items-center space-x-1 text-sm font-semibold py-1 px-3 rounded-md bg-white border hover:bg-gray-100 transition-colors" aria-label={`Reject proposal`}><XIcon className="w-4 h-4" /><span>Reject</span></button>
                <button onClick={() => onAccept(proposal)} className="flex items-center space-x-1 text-sm font-semibold py-1 px-3 rounded-md text-green-700 bg-green-200 border border-green-300 hover:bg-green-300 transition-colors" aria-label={`Accept proposal`}><CheckCircleIcon className="w-4 h-4" /><span>Accept & Update Schema</span></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SchemaProposalReviewer;
