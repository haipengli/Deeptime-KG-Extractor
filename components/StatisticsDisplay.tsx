
import React from 'react';
import { BarChartIcon, CheckCircleIcon, ClockIcon, FileTextIcon, BrainCircuitIcon } from './icons';

interface ProcessingStats {
  filesProcessed: number;
  entitiesFound: number;
  triplesExtracted: number;
  durationSeconds: number;
}

interface StatisticsDisplayProps {
  stats: ProcessingStats;
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
    <div className="flex items-center p-3 bg-gray-50 rounded-lg">
        <div className="mr-3 text-brand-accent">
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-xl font-bold text-brand-dark">{value}</p>
        </div>
    </div>
);


const StatisticsDisplay: React.FC<StatisticsDisplayProps> = ({ stats }) => {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-bold text-brand-dark mb-3 flex items-center">
            <BarChartIcon className="w-5 h-5 mr-2 text-brand-primary" />
            Processing Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<FileTextIcon className="w-6 h-6"/>} label="Files Processed" value={stats.filesProcessed} />
            <StatCard icon={<BrainCircuitIcon className="w-6 h-6"/>} label="Entities Found" value={stats.entitiesFound} />
            <StatCard icon={<CheckCircleIcon className="w-6 h-6"/>} label="Triples Extracted" value={stats.triplesExtracted} />
            <StatCard icon={<ClockIcon className="w-6 h-6"/>} label="Total Time" value={`${stats.durationSeconds.toFixed(2)}s`} />
        </div>
    </div>
  );
};

export default StatisticsDisplay;