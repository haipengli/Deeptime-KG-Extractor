
import React from 'react';
import type { ExtractedEntity } from '../types';
import { CheckboxCheckedIcon, CheckboxUncheckedIcon } from './icons';

interface EntityListProps {
  entities: ExtractedEntity[];
  onEntitySelectionChange: (index: number, selected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  sourceDescription?: string;
}

const EntityList: React.FC<EntityListProps> = ({ entities, onEntitySelectionChange, onSelectAll, onSelectNone, sourceDescription }) => {
  const selectedCount = entities.filter(e => e.selected).length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4 pb-4 border-b">
        <div>
          <h2 className="text-2xl font-bold text-brand-dark">Step 2: Review Extracted Entities</h2>
          <p className="text-sm text-gray-600">
            {sourceDescription 
                ? <>Entities extracted from <span className="font-semibold text-brand-dark">{sourceDescription}</span>. Select which to use.</>
                : "Select the entities to include in the relationship extraction."
            }
          </p>
        </div>
        <div className="flex items-center space-x-2">
            <span className="text-sm font-semibold text-gray-700">{selectedCount} / {entities.length} selected</span>
        </div>
      </div>
      
       <div className="mb-4 flex items-center space-x-4 p-2 bg-gray-50 rounded-md">
            <button onClick={onSelectAll} className="text-sm font-semibold text-brand-primary hover:underline">
                Select All
            </button>
            <button onClick={onSelectNone} className="text-sm font-semibold text-brand-primary hover:underline">
                Select None
            </button>
       </div>

      <div className="flex-grow overflow-y-auto pr-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {entities.map((entity, index) => (
            <button
              key={`${entity.name}-${index}`}
              onClick={() => onEntitySelectionChange(index, !entity.selected)}
              className={`flex items-center space-x-2 w-full text-left p-2 rounded-md border transition-colors duration-150 ${
                entity.selected ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200'
              }`}
            >
              {entity.selected ? <CheckboxCheckedIcon className="w-5 h-5 text-brand-primary flex-shrink-0"/> : <CheckboxUncheckedIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />}
              <span className="text-sm truncate" title={entity.name}>{entity.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EntityList;
