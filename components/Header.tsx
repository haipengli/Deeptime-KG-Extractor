
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-brand-dark shadow-md p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-brand-primary rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20s-8-5-8-10S5 2 5 2m14 18v-6M5 2l4 4m0 0l4-4m-4 4v10" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          DeepTime KG Extractor
        </h1>
      </div>
    </header>
  );
};

export default Header;
