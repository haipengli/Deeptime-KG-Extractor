
import React, { useState } from 'react';
import type { PaperCore, FitReport } from '../types';
import { FlaskIcon, ChevronDownIcon, CheckCircleIcon, AlertTriangleIcon } from './icons';

interface ExtractionAnalysisProps {
  paperCore: PaperCore;
  fitReport: FitReport;
}

const DetailList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => {
    if (!items || items.length === 0) return null;
    return (
        <div>
            <h4 className="font-semibold text-sm text-brand-dark mb-1">{title}</h4>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 pl-2">
                {items.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
        </div>
    );
};

const FitReportDisplay: React.FC<{ fitReport: FitReport }> = ({ fitReport }) => {
    const { decision, rationale, coverage_score, covered, uncovered } = fitReport;
    const isSchemaMode = decision === 'schema_mode';
    return (
        <div className="mt-4 p-3 bg-gray-50 rounded-md border">
            <h4 className="font-semibold text-sm text-brand-dark mb-2">Schema Fit Assessment</h4>
            <div className={`flex items-center space-x-3 p-2 rounded-md ${isSchemaMode ? 'bg-green-50' : 'bg-yellow-50'}`}>
                {isSchemaMode ? <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0"/> : <AlertTriangleIcon className="w-6 h-6 text-yellow-600 flex-shrink-0"/>}
                <div className="flex-grow">
                    <span className={`font-bold text-sm ${isSchemaMode ? 'text-green-800' : 'text-yellow-800'}`}>Decision: {decision.replace('_', ' ')}</span>
                    <p className="text-xs text-gray-600">{rationale}</p>
                </div>
                <div className="ml-auto text-right flex-shrink-0">
                    <div className="text-xl font-bold text-brand-dark">{Math.round(coverage_score * 100)}%</div>
                    <div className="text-xs text-gray-500">Coverage</div>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 text-xs">
                <div>
                    <h5 className="font-semibold mb-1 text-gray-600">Covered Concepts ({covered.length})</h5>
                    <ul className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {covered.map((c, i) => <li key={`${c.item}-${i}`} className="p-1 bg-green-100 rounded text-green-800 truncate" title={c.item}>&#10003; {c.item}</li>)}
                    </ul>
                </div>
                <div>
                    <h5 className="font-semibold mb-1 text-gray-600">Uncovered Concepts ({uncovered.length})</h5>
                     <ul className="space-y-1 max-h-24 overflow-y-auto pr-1">
                        {uncovered.map((u, i) => <li key={`${u.item}-${i}`} className="p-1 bg-red-100 rounded text-red-800 truncate" title={u.item}>&#10007; {u.item}</li>)}
                    </ul>
                </div>
            </div>
        </div>
    )
};


const ExtractionAnalysis: React.FC<ExtractionAnalysisProps> = ({ paperCore, fitReport }) => {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left">
                <h3 className="text-lg font-bold text-brand-dark flex items-center">
                    <FlaskIcon className="w-5 h-5 mr-2 text-brand-primary" />
                    Extraction Analysis
                </h3>
                <ChevronDownIcon className={`w-5 h-5 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="mt-4 pt-4 border-t">
                    <div className="space-y-4">
                        <h3 className="font-bold text-base text-brand-dark">Paper's Core Essence (from Abstract)</h3>
                        <DetailList title="Research Questions" items={paperCore.questions} />
                        <DetailList title="Key Results" items={paperCore.key_results} />
                        <DetailList title="Study Area" items={paperCore.study_area} />
                        <DetailList title="Time Interval" items={paperCore.time_interval} />
                        <DetailList title="Methods Used" items={paperCore.methods} />
                    </div>
                    <FitReportDisplay fitReport={fitReport} />
                </div>
            )}
        </div>
    );
};

export default ExtractionAnalysis;