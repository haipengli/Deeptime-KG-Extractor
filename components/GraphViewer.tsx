
import React, { useState, useEffect, useMemo, useRef } from 'react';
import CytoscapeComponent from 'react-cytoscapejs';
import cytoscape, { Core } from 'cytoscape';
import type { Triple, ExtractedEntity } from '../types';
import { ChevronDownIcon, CheckboxCheckedIcon, CheckboxUncheckedIcon } from './icons';

interface GraphViewerProps {
  triples: Triple[];
  entities: ExtractedEntity[];
}

const stringToColor = (str: string) => {
    let hash = 0;
    if (str.length === 0) return '#000000';
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

const MultiSelectDropdown: React.FC<{
    options: string[];
    selected: Set<string>;
    onSelectionChange: (newSelection: Set<string>) => void;
    placeholder: string;
}> = ({ options, selected, onSelectionChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: string) => {
        const newSelection = new Set(selected);
        if (newSelection.has(option)) {
            newSelection.delete(option);
        } else {
            newSelection.add(option);
        }
        onSelectionChange(newSelection);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                <span>{placeholder} ({selected.size === 0 ? 'All' : selected.size})</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {options.map(option => (
                        <div key={option} onClick={() => toggleOption(option)} className="flex items-center space-x-2 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-100 cursor-pointer">
                            {selected.has(option) ? <CheckboxCheckedIcon className="w-4 h-4 text-brand-primary" /> : <CheckboxUncheckedIcon className="w-4 h-4 text-gray-400" />}
                            <span className="flex-grow truncate" title={option}>{option}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


const GraphViewer: React.FC<GraphViewerProps> = ({ triples, entities }) => {
    const [cy, setCy] = useState<Core | null>(null);
    const [confidence, setConfidence] = useState(0);
    
    const allPredicates = useMemo(() => [...new Set(triples.map(t => t.predicate))].sort(), [triples]);
    const allEntityTypes = useMemo(() => [...new Set(entities.map(e => e.type))].sort(), [entities]);

    const [selectedPredicates, setSelectedPredicates] = useState<Set<string>>(new Set());
    const [selectedEntityTypes, setSelectedEntityTypes] = useState<Set<string>>(new Set());

    const entityTypeMap = useMemo(() => new Map(entities.map(e => [e.name, e.type])), [entities]);

    const elements = useMemo(() => {
        const nodes = new Map<string, cytoscape.ElementDefinition>();
        const edges: cytoscape.ElementDefinition[] = [];

        triples.forEach(triple => {
            const subjectType = entityTypeMap.get(triple.subject) || 'Unknown';
            const objectType = entityTypeMap.get(triple.object) || 'Unknown';

            if (!nodes.has(triple.subject)) {
                nodes.set(triple.subject, { data: { id: triple.subject, label: triple.subject, type: subjectType, color: stringToColor(subjectType) } });
            }
            if (!nodes.has(triple.object)) {
                nodes.set(triple.object, { data: { id: triple.object, label: triple.object, type: objectType, color: stringToColor(objectType) } });
            }
            edges.push({ data: { source: triple.subject, target: triple.object, label: triple.predicate, confidence: triple.confidence ?? 0 } });
        });
        return [...Array.from(nodes.values()), ...edges];
    }, [triples, entityTypeMap]);
    
    useEffect(() => {
        if (!cy) return;

        cy.batch(() => {
            // Build selectors
            const confidenceSelector = `[confidence >= ${confidence / 100}]`;
            
            const predicateSelector = selectedPredicates.size > 0
                ? Array.from(selectedPredicates).map(p => `[label = "${p}"]`).join(',')
                : '';
                
            const entityTypeSelector = selectedEntityTypes.size > 0
                ? Array.from(selectedEntityTypes).map(t => `[type = "${t}"]`).join(',')
                : '';

            // Get visible edges based on confidence and predicate filters
            let visibleEdges = cy.edges(confidenceSelector);
            if (predicateSelector) {
                visibleEdges = visibleEdges.filter(predicateSelector);
            }

            // Get nodes connected to visible edges
            const visibleNodes = visibleEdges.connectedNodes();
            
            // Further filter nodes by type if a type filter is active
            const finalVisibleNodes = entityTypeSelector ? visibleNodes.filter(entityTypeSelector) : visibleNodes;
            
            // If nodes were filtered by type, we must also filter edges to only those connecting the final visible nodes
            const finalVisibleEdges = entityTypeSelector ? finalVisibleNodes.edgesWith(finalVisibleNodes) : visibleEdges;
            
            // Show the final set of nodes and edges
            const finalElements = finalVisibleNodes.union(finalVisibleEdges);
            cy.elements().addClass('hidden');
            finalElements.removeClass('hidden');
        });
        
        const visibleElements = cy.elements().not('.hidden');
        if (visibleElements.length > 0) {
            cy.layout({ name: 'cose', animate: true, animationDuration: 300, fit: true, padding: 30 }).run();
        }

    }, [cy, confidence, selectedPredicates, selectedEntityTypes, elements]);


    const stylesheet: cytoscape.StylesheetCSS[] = [
        {
            selector: 'node',
            css: {
                'background-color': 'data(color)',
                'label': 'data(label)',
                'width': 25,
                'height': 25,
                'font-size': '9px',
                'color': '#333',
                'text-background-opacity': 0.8,
                'text-background-color': '#ffffff',
                'text-background-shape': 'roundrectangle',
                'text-background-padding': '2px',
                'text-outline-width': 0,
            }
        },
        {
            selector: 'edge',
            css: {
                'width': 1.5,
                'label': 'data(label)',
                'line-color': '#aab',
                'target-arrow-color': '#aab',
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'font-size': '8px',
                'color': '#333',
                'text-rotation': 'autorotate',
                'text-background-opacity': 0.8,
                'text-background-color': '#ffffff',
                'text-background-shape': 'roundrectangle',
                'text-background-padding': '2px'
            }
        },
        {
            selector: '.hidden',
            css: {
                'display': 'none'
            }
        }
    ];

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3 p-3 mb-2 border rounded-md bg-gray-50">
                <div className="md:col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Confidence ({confidence}%)</label>
                    <input type="range" min="0" max="100" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full" />
                </div>
                 <div className="md:col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Predicates</label>
                    <MultiSelectDropdown options={allPredicates} selected={selectedPredicates} onSelectionChange={setSelectedPredicates} placeholder="Filter Predicates" />
                </div>
                 <div className="md:col-span-1">
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Entity Types</label>
                    <MultiSelectDropdown options={allEntityTypes} selected={selectedEntityTypes} onSelectionChange={setSelectedEntityTypes} placeholder="Filter Entity Types" />
                </div>
            </div>
            <div className="flex-grow w-full h-full border rounded-md overflow-hidden bg-white">
                <CytoscapeComponent
                    elements={elements}
                    style={{ width: '100%', height: '100%' }}
                    cy={setCy}
                    layout={{ name: 'cose', animate: true, fit: true, padding: 30 }}
                    stylesheet={stylesheet}
                />
            </div>
        </div>
    );
};

export default GraphViewer;
