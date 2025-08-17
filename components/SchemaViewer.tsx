import React, { useState } from 'react';
import type { Schema } from '../types';
import { EditIcon, SaveIcon, ResetIcon, PlusIcon, XIcon, TrashIcon, InfoIcon, LockClosedIcon, LockOpenIcon, ChevronDownIcon, ChevronRightIcon } from './icons';

interface SchemaEditorProps {
    schema: Schema;
    onSchemaChange: (newSchema: Schema) => void;
    onSchemaReset: () => void;
}

type Tab = 'predicates' | 'observable' | 'interpretive';

// --- Utility for deep, immutable updates ---
const updateSchemaDeeply = (schema: Schema, path: (string | number)[], value: any): Schema => {
    const newSchema = JSON.parse(JSON.stringify(schema)); // Simple deep copy
    let current: any = newSchema;
    for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
    }

    const finalKey = path[path.length - 1];
    if (value === '---DELETE---') {
        if (Array.isArray(current)) {
            current.splice(finalKey as number, 1);
        } else {
            delete current[finalKey];
        }
    } else {
       current[finalKey] = value;
    }
    return newSchema;
}


// --- Reusable Editable Item Component ---
const EditableItem: React.FC<{
    item: string;
    onUpdate: (newItem: string) => void;
    onDelete?: () => void;
    isConcept?: boolean;
    isEditingEnabled: boolean;
}> = ({ item, onUpdate, onDelete, isConcept = false, isEditingEnabled }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(item);

    const handleSave = () => {
        if (value.trim() && value.trim() !== item) {
            onUpdate(value.trim());
        }
        setIsEditing(false);
    };

    const baseClasses = isConcept 
      ? "bg-gray-100 text-gray-800 hover:bg-blue-100" 
      : "bg-blue-100 text-blue-800 hover:bg-blue-200";

    return (
        <div className={`group text-sm px-3 py-1 rounded-full flex items-center space-x-2 transition-all duration-200 ${baseClasses}`}>
            {isEditing && isEditingEnabled ? (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setIsEditing(false); }}
                    className="bg-white border border-brand-accent rounded px-1 text-sm w-40"
                    autoFocus
                />
            ) : (
                <span className="cursor-default font-medium">{item}</span>
            )}
            {isEditingEnabled && (
              <>
                <button onClick={() => setIsEditing(!isEditing)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                    {isEditing ? <SaveIcon className="w-4 h-4 text-green-600" /> : <EditIcon className="w-4 h-4 text-gray-500" />}
                </button>
                {onDelete && (
                    <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                        <TrashIcon className="w-4 h-4 text-red-500" />
                    </button>
                )}
              </>
            )}
        </div>
    );
};

// --- Form for Adding New Items ---
const AddItemForm: React.FC<{
    onAdd: (name: string) => boolean; // Return true on success, false on failure (e.g., duplicate)
    placeholder: string;
    buttonText: string;
    isEditingEnabled: boolean;
}> = ({ onAdd, placeholder, buttonText, isEditingEnabled }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string|null>(null);
    
    if (!isEditingEnabled) return null;

    const handleAdd = () => {
        if (!value.trim()) {
            setError("Name cannot be empty.");
            return;
        }
        if (!onAdd(value.trim())) {
             setError("This item already exists.");
             return;
        }
        setValue('');
        setError(null);
        setIsAdding(false);
    }
    
    if (!isAdding) {
        return (
            <button onClick={() => setIsAdding(true)} className="flex items-center space-x-2 text-sm text-brand-primary bg-blue-100 hover:bg-blue-200 font-semibold py-1 px-3 rounded-full transition-colors">
                <PlusIcon />
                <span>{buttonText}</span>
            </button>
        )
    }

    return (
        <div className="w-full mt-2 p-2 border rounded-md bg-gray-50">
            <div className="flex items-center space-x-2">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder={placeholder}
                    className="border border-gray-300 rounded px-2 py-1 text-sm flex-grow focus:ring-brand-accent focus:border-brand-accent"
                    autoFocus
                />
                <button onClick={handleAdd} className="p-1.5 bg-green-500 text-white rounded hover:bg-green-600"><SaveIcon className="w-4 h-4"/></button>
                <button onClick={() => { setIsAdding(false); setError(null); }} className="p-1.5 bg-gray-400 text-white rounded hover:bg-gray-500"><XIcon className="w-4 h-4"/></button>
            </div>
            {error && <p className="text-red-600 text-xs mt-1">{error}</p>}
        </div>
    )
}

// --- Recursive Component for Displaying and Editing Axis Content ---
const EditableAxisContent: React.FC<{
    data: any;
    path: (string | number)[];
    schema: Schema;
    onSchemaChange: (newSchema: Schema) => void;
    onRenameKey: (path: (string|number)[], oldKey: string, newKey: string) => void;
    isEditingEnabled: boolean;
    expandedItems: Record<string, boolean>;
    toggleItem: (key: string) => void;
}> = ({ data, path, schema, onSchemaChange, onRenameKey, isEditingEnabled, expandedItems, toggleItem }) => {

    const handleUpdate = (newPath: (string | number)[], value: any) => {
        onSchemaChange(updateSchemaDeeply(schema, newPath, value));
    };

    const handleAdd = (currentPath: (string|number)[], currentData: any, newValue: string, type: 'concept' | 'category'): boolean => {
        const lowerCaseValue = newValue.toLowerCase();

        // Check for duplicates
        if (Array.isArray(currentData) && currentData.some(i => typeof i === 'string' && i.toLowerCase() === lowerCaseValue)) return false;
        if (typeof currentData === 'object' && !Array.isArray(currentData) && Object.keys(currentData).some(k => k.toLowerCase() === lowerCaseValue)) return false;
        
        let newData;
        if(Array.isArray(currentData)) {
            newData = type === 'concept' ? [...currentData, newValue] : [...currentData, {[newValue]: []}];
        } else {
            newData = {...currentData, [newValue]: type === 'concept' ? null : [] }; // concepts in objects aren't supported, so add as sub-category
        }

        handleUpdate(currentPath, newData);
        return true;
    };

    if (Array.isArray(data)) {
        return (
            <div className="w-full flex flex-wrap gap-2">
                {data.map((item, index) => {
                    const itemPath = [...path, index];
                    if (typeof item === 'string') {
                        return <EditableItem key={`${item}-${index}`} item={item} isConcept
                            onUpdate={newItem => handleUpdate(itemPath, newItem)}
                            onDelete={() => handleUpdate(itemPath, '---DELETE---')} 
                            isEditingEnabled={isEditingEnabled}/>;
                    }
                    if (typeof item === 'object' && item !== null) {
                        const key = Object.keys(item)[0];
                        return (
                            <div key={key} className="w-full">
                                <EditableAxisContent data={{[key]: item[key]}} path={itemPath} schema={schema} onSchemaChange={onSchemaChange} onRenameKey={onRenameKey} isEditingEnabled={isEditingEnabled} expandedItems={expandedItems} toggleItem={toggleItem}/>
                            </div>
                        )
                    }
                    return null;
                })}
                <AddItemForm 
                    onAdd={(name) => handleAdd(path, data, name, 'concept')}
                    placeholder="New concept name"
                    buttonText="Add Concept"
                    isEditingEnabled={isEditingEnabled}
                />
                <AddItemForm 
                    onAdd={(name) => handleAdd(path, data, name, 'category')}
                    placeholder="New sub-category name"
                    buttonText="Add Sub-Category"
                    isEditingEnabled={isEditingEnabled}
                />
            </div>
        );
    }

    if (typeof data === 'object' && data !== null) {
        return (
            <div className="w-full space-y-3">
                {Object.entries(data).map(([key, value]) => {
                    const keyPath = [...path, key];
                    const expansionKey = keyPath.join('.');
                    const isExpanded = expandedItems[expansionKey] ?? false; // Default to collapsed
                    const isCollapsible = value && ((Array.isArray(value) && value.length > 0) || (typeof value === 'object' && value !== null && Object.keys(value).length > 0));

                    return (
                        <div key={key} className="w-full pl-4 border-l-2 border-gray-200">
                             <div className="font-semibold text-brand-dark mb-2 flex items-center">
                                {isCollapsible ? (
                                    <button onClick={() => toggleItem(expansionKey)} className="mr-1 p-1 rounded-full hover:bg-gray-100">
                                        {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                    </button>
                                ) : (
                                    <div className="w-6 mr-1"></div> // Placeholder for alignment
                                )}
                                <EditableItem item={key}
                                onUpdate={newKey => onRenameKey(path, key, newKey)}
                                onDelete={() => handleUpdate(keyPath, '---DELETE---')}
                                isEditingEnabled={isEditingEnabled}
                                />
                            </div>
                            {isExpanded && isCollapsible && (
                                <div className="flex flex-wrap gap-2 pl-7">
                                    <EditableAxisContent data={value} path={keyPath} schema={schema} onSchemaChange={onSchemaChange} onRenameKey={onRenameKey} isEditingEnabled={isEditingEnabled} expandedItems={expandedItems} toggleItem={toggleItem}/>
                                </div>
                            )}
                        </div>
                    );
                })}
                 <AddItemForm 
                    onAdd={(name) => handleAdd(path, data, name, 'category')}
                    placeholder="New sub-category name"
                    buttonText="Add Sub-Category"
                    isEditingEnabled={isEditingEnabled}
                />
            </div>
        );
    }
    return null;
}


// --- Main Schema Editor Component ---
const SchemaViewer: React.FC<SchemaEditorProps> = ({ schema, onSchemaChange, onSchemaReset }) => {
  const [activeTab, setActiveTab] = useState<Tab>('predicates');
  const [isEditing, setIsEditing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleItem = (key: string) => {
      setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRenameKey = (path: (string|number)[], oldKey: string, newKey: string) => {
        const newSchema = JSON.parse(JSON.stringify(schema));
        let parent: any = newSchema;
        for (const p of path) {
            parent = parent[p];
        }
        if (parent && typeof parent === 'object' && oldKey in parent) {
            const value = parent[oldKey];
            delete parent[oldKey];
            parent[newKey] = value;
            onSchemaChange(newSchema);
        }
    };
  
  const handleAddPredicateCategory = (name: string): boolean => {
      if (Object.keys(schema.predicates.predicateCategories).some(c => c.toLowerCase() === name.toLowerCase())) {
          return false;
      }
      const newCategories = {...schema.predicates.predicateCategories, [name]: []};
      onSchemaChange({...schema, predicates: {...schema.predicates, predicateCategories: newCategories}});
      return true;
  }
  
  const handleAddPredicate = (category: string, name: string): boolean => {
      if(schema.predicates.predicateCategories[category].some(p => p.toLowerCase() === name.toLowerCase())) {
          return false;
      }
      const newPredicates = [...schema.predicates.predicateCategories[category], name];
      const newCategories = {...schema.predicates.predicateCategories, [category]: newPredicates};
      onSchemaChange({...schema, predicates: {...schema.predicates, predicateCategories: newCategories}});
      return true;
  }

  const handleAddCategory = (axis: 'observableAxis' | 'interpretiveAxis', name: string): boolean => {
      if(Object.keys(schema[axis]).some(k => k.toLowerCase() === name.toLowerCase())) {
          return false;
      }
      const newAxis = {...schema[axis], [name]: { concepts: [] }};
      onSchemaChange({...schema, [axis]: newAxis});
      return true;
  }
  
  const TabButton: React.FC<{ tabName: Tab; label: string }> = ({ tabName, label }) => (
    <button onClick={() => setActiveTab(tabName)} className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors duration-200 ${ activeTab === tabName ? 'bg-white text-brand-primary border-b-2 border-brand-primary' : 'bg-gray-100 text-gray-600 hover:bg-gray-200' }`} >
      {label}
    </button>
  );

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-brand-dark">Schema Editor</h2>
          <p className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md inline-block mt-1">Version: {schema.meta.version}</p>
        </div>
        <div className="flex items-center space-x-4">
            <button onClick={() => setIsEditing(!isEditing)} className={`flex items-center space-x-2 text-sm font-semibold py-1 px-3 rounded-md transition-colors duration-200 ${isEditing ? 'text-yellow-800 bg-yellow-100 hover:bg-yellow-200' : 'text-gray-600 hover:text-brand-primary hover:bg-gray-100'}`}>
                {isEditing ? <LockOpenIcon className="w-4 h-4" /> : <LockClosedIcon className="w-4 h-4" />}
                <span>{isEditing ? 'Lock Schema' : 'Enable Editing'}</span>
            </button>
            <button onClick={onSchemaReset} className="flex items-center space-x-2 text-sm text-gray-600 hover:text-brand-primary font-semibold py-1 px-2 rounded-md hover:bg-gray-100 transition-colors">
                <ResetIcon className="w-4 h-4"/>
                <span>Reset to Default</span>
            </button>
        </div>
      </div>
      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-2">
          <TabButton tabName="predicates" label="Predicates" />
          <TabButton tabName="observable" label="Observable Axis" />
          <TabButton tabName="interpretive" label="Interpretive Axis" />
        </nav>
      </div>
      <div className="max-h-[calc(100vh-320px)] overflow-y-auto pr-2 space-y-6">
         {!isEditing && (
             <div className="w-full text-sm text-yellow-800 p-3 bg-yellow-50 border border-yellow-200 rounded-md flex items-start" role="alert">
                <InfoIcon className="w-5 h-5 mr-3 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold">Read-Only Mode</p>
                    <p>Editing is disabled to prevent accidental changes. Click "Enable Editing" to modify the schema.</p>
                </div>
            </div>
         )}
         {isEditing && (
             <div className="w-full text-xs text-gray-500 italic p-2 bg-gray-50 rounded-md">
                You can now edit the entire schema. Changes are saved locally.
                Updating the schema will clear current results and require you to re-run the extraction.
            </div>
         )}
        {activeTab === 'predicates' && (
           <div className="space-y-2">
                {Object.entries(schema.predicates.predicateCategories).map(([category, predicates]) => {
                    const key = `pred-${category}`;
                    const isExpanded = expandedItems[key] ?? false;
                    return (
                        <div key={category} className="mb-2">
                            <h3 className="text-lg font-bold text-brand-primary mb-3 pb-2 border-b border-gray-300 flex items-center">
                                <button onClick={() => toggleItem(key)} className="mr-2 p-1 rounded-full hover:bg-gray-100">
                                    {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                </button>
                                <EditableItem item={category}
                                    onUpdate={newCat => handleRenameKey(['predicates', 'predicateCategories'], category, newCat)}
                                    onDelete={() => onSchemaChange(updateSchemaDeeply(schema, ['predicates', 'predicateCategories', category], '---DELETE---'))}
                                    isEditingEnabled={isEditing}
                                />
                            </h3>
                            {isExpanded && (
                                <div className="flex flex-wrap gap-2 items-start pl-8 mt-2">
                                    {predicates.map((p, index) => (
                                        <EditableItem key={p} item={p} 
                                            onUpdate={(newP) => onSchemaChange(updateSchemaDeeply(schema, ['predicates', 'predicateCategories', category, index], newP))}
                                            onDelete={() => onSchemaChange(updateSchemaDeeply(schema, ['predicates', 'predicateCategories', category, index], '---DELETE---'))} 
                                            isEditingEnabled={isEditing}
                                        />
                                    ))}
                                    <AddItemForm 
                                        onAdd={(name) => handleAddPredicate(category, name)}
                                        placeholder="New predicate name"
                                        buttonText="Add Predicate"
                                        isEditingEnabled={isEditing}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
                 <AddItemForm 
                    onAdd={handleAddPredicateCategory}
                    placeholder="New predicate category name"
                    buttonText="Add Predicate Category"
                    isEditingEnabled={isEditing}
                />
           </div>
        )}
        {activeTab === 'observable' && (
          <div className="space-y-2">
            {Object.entries(schema.observableAxis).map(([category, data]) => {
                 const key = `obs-${category}`;
                 const isExpanded = expandedItems[key] ?? false;
                 return (
                     <div key={category} className="mb-2">
                        <h3 className="text-lg font-bold text-brand-primary mb-3 pb-2 border-b border-gray-300 flex items-center">
                            <button onClick={() => toggleItem(key)} className="mr-2 p-1 rounded-full hover:bg-gray-100">
                                {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                            </button>
                             <EditableItem item={category}
                                onUpdate={newCat => handleRenameKey(['observableAxis'], category, newCat)}
                                onDelete={() => onSchemaChange(updateSchemaDeeply(schema, ['observableAxis', category], '---DELETE---'))}
                                isEditingEnabled={isEditing}
                             />
                        </h3>
                        {isExpanded && <EditableAxisContent data={data.concepts} path={['observableAxis', category, 'concepts']} schema={schema} onSchemaChange={onSchemaChange} onRenameKey={handleRenameKey} isEditingEnabled={isEditing} expandedItems={expandedItems} toggleItem={toggleItem}/>}
                    </div>
                );
            })}
             <AddItemForm 
                onAdd={(name) => handleAddCategory('observableAxis', name)}
                placeholder="New category name"
                buttonText="Add Category"
                isEditingEnabled={isEditing}
            />
          </div>
        )}
        {activeTab === 'interpretive' && (
           <div className="space-y-2">
            {Object.entries(schema.interpretiveAxis).map(([category, data]) => {
                const key = `int-${category}`;
                const isExpanded = expandedItems[key] ?? false;
                return (
                    <div key={category} className="mb-2">
                        <h3 className="text-lg font-bold text-brand-primary mb-3 pb-2 border-b border-gray-300 flex items-center">
                             <button onClick={() => toggleItem(key)} className="mr-2 p-1 rounded-full hover:bg-gray-100">
                                {isExpanded ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                            </button>
                             <EditableItem item={category}
                                onUpdate={newCat => handleRenameKey(['interpretiveAxis'], category, newCat)}
                                onDelete={() => onSchemaChange(updateSchemaDeeply(schema, ['interpretiveAxis', category], '---DELETE---'))}
                                isEditingEnabled={isEditing}
                             />
                        </h3>
                        {isExpanded && <EditableAxisContent data={data.concepts} path={['interpretiveAxis', category, 'concepts']} schema={schema} onSchemaChange={onSchemaChange} onRenameKey={handleRenameKey} isEditingEnabled={isEditing} expandedItems={expandedItems} toggleItem={toggleItem}/>}
                    </div>
                );
            })}
             <AddItemForm 
                onAdd={(name) => handleAddCategory('interpretiveAxis', name)}
                placeholder="New category name"
                buttonText="Add Category"
                isEditingEnabled={isEditing}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SchemaViewer;