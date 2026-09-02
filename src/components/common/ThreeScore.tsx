import React from 'react';

interface ThreeScoreProps {
  connect: number | null | undefined;
  clarify: number | null | undefined;
  convert: number | null | undefined;
  layout?: 'compact' | 'bars' | 'pills';
  className?: string;
}

export const ThreeScore: React.FC<ThreeScoreProps> = ({
  connect,
  clarify,
  convert,
  layout = 'compact',
  className = ''
}) => {
  const isCritical = (score: number | null | undefined) => score !== null && score !== undefined && score < 60;
  
  const formatVal = (score: number | null | undefined) => {
    if (score === null || score === undefined || isNaN(score)) return 'N/A';
    return `${Math.round(score)}%`;
  };

  if (layout === 'pills') {
    return (
      <div className={`flex items-center gap-1.5 font-mono text-[11px] ${className}`}>
        <span className={`px-1.5 py-0.5 rounded font-medium border ${isCritical(connect) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[#F2F4F7] text-[#344054] border-[#E5E8EC]'}`} title="C1 Comunicar">
          C1 {formatVal(connect)}
        </span>
        <span className={`px-1.5 py-0.5 rounded font-medium border ${isCritical(clarify) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[#F2F4F7] text-[#344054] border-[#E5E8EC]'}`} title="C2 Clarificar">
          C2 {formatVal(clarify)}
        </span>
        <span className={`px-1.5 py-0.5 rounded font-medium border ${isCritical(convert) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[#F2F4F7] text-[#344054] border-[#E5E8EC]'}`} title="C3 Convertir">
          C3 {formatVal(convert)}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 w-full min-w-[130px] max-w-[170px] ${className}`}>
      <div className="flex items-center justify-between text-[10px] font-mono text-[#667085]">
        <span className="flex items-center gap-0.5">
          <span className="font-medium text-[#031E3C]">C1</span>
          <span className={`font-semibold ${isCritical(connect) ? 'text-[#D92D20]' : 'text-[#031E3C]'}`}>{formatVal(connect)}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <span className="font-medium text-[#031E3C]">C2</span>
          <span className={`font-semibold ${isCritical(clarify) ? 'text-[#D92D20]' : 'text-[#031E3C]'}`}>{formatVal(clarify)}</span>
        </span>
        <span className="flex items-center gap-0.5">
          <span className="font-medium text-[#031E3C]">C3</span>
          <span className={`font-semibold ${isCritical(convert) ? 'text-[#D92D20]' : 'text-[#031E3C]'}`}>{formatVal(convert)}</span>
        </span>
      </div>

      {/* Segmented Micro Progress Bars in uniform Tech Navy */}
      <div className="grid grid-cols-3 gap-1 h-1.5 w-full bg-[#F2F4F7] rounded-full p-0.5 overflow-hidden">
        <div className="bg-[#E5E8EC] h-full rounded-full overflow-hidden">
          {connect !== null && connect !== undefined && (
            <div className={`h-full ${isCritical(connect) ? 'bg-[#D92D20]' : 'bg-[#031E3C]'} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, connect))}%` }} />
          )}
        </div>
        <div className="bg-[#E5E8EC] h-full rounded-full overflow-hidden">
          {clarify !== null && clarify !== undefined && (
            <div className={`h-full ${isCritical(clarify) ? 'bg-[#D92D20]' : 'bg-[#031E3C]'} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, clarify))}%` }} />
          )}
        </div>
        <div className="bg-[#E5E8EC] h-full rounded-full overflow-hidden">
          {convert !== null && convert !== undefined && (
            <div className={`h-full ${isCritical(convert) ? 'bg-[#D92D20]' : 'bg-[#031E3C]'} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, convert))}%` }} />
          )}
        </div>
      </div>
    </div>
  );
};

