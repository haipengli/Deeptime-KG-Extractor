

import React, { useState, useMemo } from 'react';
import type { ExtractedEntity } from '../types';
import { CheckboxCheckedIcon, CheckboxUncheckedIcon, InfoIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

interface EntityListProps {
  entities: ExtractedEntity[];
  onEntitySelectionChange: (index: number, selected: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  sourceDescription?: string;
}

type SortKey = 'name' | 'confidence' | 'type';
type SortDirection = 'asc' | 'desc';

const EntityList: React.FC<EntityListProps> = ({ entities, onEntitySelectionChange, onSelectAll, onSelectNone, sourceDescription }) => {
  const selectedCount = entities.filter(e => e.selected).length;
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedEntities = useMemo(() => {
    return [...entities].sort((a, b) => {
      let aVal, bVal;
      switch (sortKey) {
          case 'confidence':
              aVal = a.confidence ?? 0;
              bVal = b.confidence ?? 0;
              break;
          case 'type':
              aVal = a.type || '';
              bVal = b.type || '';
              break;
          case 'name':
          default:
              aVal = a.name;
              bVal = b.name;
              break;
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      // Secondary sort by name if primary keys are equal
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
  }, [entities, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortButton: React.FC<{ sortKeyName: SortKey, label: string }> = ({ sortKeyName, label }) => (
    <button onClick={() => handleSort(sortKeyName)} className="flex items-center space-x-1 font-semibold text-gray-600 hover:text-brand-primary">
        <span>{label}</span>
        {sortKey === sortKeyName && (sortDirection === 'asc' ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />)}
    </button>
  );

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
      
       <div className="mb-4 flex items-center justify-between p-2 bg-gray-50 rounded-md">
            <div className="flex items-center space-x-4">
                <button onClick={onSelectAll} className="text-sm font-semibold text-brand-primary hover:underline">
                    Select All
                </button>
                <button onClick={onSelectNone} className="text-sm font-semibold text-brand-primary hover:underline">
                    Select None
                </button>
            </div>
            <div className="flex items-center space-x-3 text-sm">
                <span className="text-gray-500">Sort by:</span>
                <SortButton sortKeyName="name" label="Name" />
                <SortButton sortKeyName="type" label="Type" />
                <SortButton sortKeyName="confidence" label="Confidence" />
            </div>
       </div>

      <div className="flex-grow overflow-y-auto pr-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sortedEntities.map((entity) => {
            const originalIndex = entities.findIndex(e => e.name === entity.name && e.type === entity.type);
            const confidenceScore = entity.confidence !== undefined ? (entity.confidence * 100).toFixed(0) : null;
            
            return (
                <div key={`${entity.name}-${originalIndex}`} className="group relative">
                    <button
                    onClick={() => onEntitySelectionChange(originalIndex, !entity.selected)}
                    className={`flex items-start w-full text-left p-2 rounded-md border transition-colors duration-150 ${
                        entity.selected ? 'bg-blue-100 border-blue-300 text-blue-900' : 'bg-gray-100 border-gray-200 text-gray-800 hover:bg-gray-200'
                    }`}
                    >
                    {entity.selected ? <CheckboxCheckedIcon className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5"/> : <CheckboxUncheckedIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />}
                    <div className="flex-grow flex flex-col ml-2">
                      <span className="text-sm font-medium leading-tight" title={entity.name}>{entity.name}</span>
                      <span className="text-xs text-brand-secondary font-mono leading-tight">{entity.type}</span>
                    </div>
                     {confidenceScore !== null && (
                        <span className="text-xs font-bold text-gray-500 bg-white px-1.5 py-0.5 rounded-full border self-center flex-shrink-0">{confidenceScore}%</span>
                     )}
                    </button>
                    {entity.justification && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 p-2 bg-brand-dark text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                            <InfoIcon className="w-4 h-4 inline mr-1" />
                            {entity.justification}
                        </div>
                    )}
                </div>
            )
          })}
        </div>
      </div>
    </div>
  );
};

export default EntityList;