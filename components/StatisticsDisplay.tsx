
import React from 'react';
import { BarChartIcon, CheckCircleIcon, ClockIcon, FileTextIcon, BrainCircuitIcon } from './icons';
import type { ProcessingStats } from '../types';

interface StatisticsDisplayProps {
  stats: ProcessingStats;
  onNavigateToEntities: () => void;
  onNavigateToTriples: () => void;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, onClick }) => {
    const Tag = onClick ? 'button' : 'div';
    const props = {
        onClick,
        className: `flex items-center p-3 bg-gray-50 rounded-lg w-full text-left ${onClick ? 'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-accent transition-colors' : ''}`,
    };
    
    return (
        <Tag {...props}>
            <div className="mr-3 text-brand-accent">
                {icon}
            </div>
            <div>
                <p className="text-sm text-gray-500">{label}</p>
                <p className="text-xl font-bold text-brand-dark">{value}</p>
            </div>
        </Tag>
    );
};

const TimeStatCard: React.FC<{ stats: ProcessingStats }> = ({ stats }) => {
    const hasBreakdown = stats.entityExtractionDuration !== undefined && stats.relationshipExtractionDuration !== undefined;
    return (
        <div className="flex items-center p-3 bg-gray-50 rounded-lg">
            <div className="mr-3 text-brand-accent">
                <ClockIcon className="w-6 h-6"/>
            </div>
            <div>
                <p className="text-sm text-gray-500">Total Time</p>
                <p className="text-xl font-bold text-brand-dark">{stats.totalDurationSeconds.toFixed(2)}s</p>
                {hasBreakdown && (
                    <p className="text-xs text-gray-500 mt-1">
                        Entities: {stats.entityExtractionDuration!.toFixed(1)}s, Relations: {stats.relationshipExtractionDuration!.toFixed(1)}s
                    </p>
                )}
            </div>
        </div>
    );
};

const BreakdownList: React.FC<{ title: string; data: Record<string, number> }> = ({ title, data }) => {
    const sortedData = Object.entries(data).sort(([, a], [, b]) => b - a);
    if (sortedData.length === 0) return null;

    return (
        <div>
            <h4 className="text-md font-semibold text-brand-dark mb-2">{title}</h4>
            <div className="max-h-36 overflow-y-auto pr-2 bg-gray-50 p-2 rounded-md space-y-1 text-sm border">
                {sortedData.map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center bg-white p-1 rounded">
                        <span className="text-gray-700 truncate" title={key}>{key}</span>
                        <span className="font-bold text-brand-dark bg-gray-200 px-2 rounded-full text-xs">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};


const StatisticsDisplay: React.FC<StatisticsDisplayProps> = ({ stats, onNavigateToEntities, onNavigateToTriples }) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-bold text-brand-dark mb-3 flex items-center">
            <BarChartIcon className="w-5 h-5 mr-2 text-brand-primary" />
            Processing Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<FileTextIcon className="w-6 h-6"/>} label="Files Processed" value={stats.filesProcessed} />
            <StatCard icon={<BrainCircuitIcon className="w-6 h-6"/>} label="Entities Selected" value={stats.entitiesFound} onClick={onNavigateToEntities} />
            <StatCard icon={<CheckCircleIcon className="w-6 h-6"/>} label="Triples Extracted" value={stats.triplesExtracted} onClick={onNavigateToTriples} />
            <TimeStatCard stats={stats} />
        </div>
         <div className="col-span-2 md:col-span-4 mt-4 border-t pt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BreakdownList title="Entity Types" data={stats.entityTypeCounts} />
              <BreakdownList title="Predicate Types" data={stats.predicateTypeCounts} />
          </div>
      </div>
    </div>
  );
};

export default StatisticsDisplay;
