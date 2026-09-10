import React from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, CardHeader, ChartSkeleton, EmptyState, ErrorState } from '../ui';
import type { DistributionItem, StatusItem, TrendPoint } from './useExecutiveHome';

const retry = <button className="cm-link" onClick={() => window.location.reload()}>Reintentar</button>;

const TrendTooltip: React.FC<{ active?: boolean; payload?: Array<{ payload: TrendPoint }> }> = ({ active, payload }) => {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  return <div className="cm-chart-tooltip"><b>{point.label}</b><span>Resultado: {point.score}%</span><span>Evaluaciones: {point.count}</span></div>;
};

export const QualityTrendCard: React.FC<{ data: TrendPoint[]; threshold: number | null; granularity: string; error?: string; loading?: boolean }> = ({ data, threshold, granularity, error, loading }) => loading ? <ChartSkeleton /> : <Card className="cm-exec-trend">
  <CardHeader title="Tendencia de calidad" description={`Promedio real por ${granularity === 'day' ? 'día' : granularity === 'week' ? 'semana' : 'mes'}.`} action={threshold !== null ? <Badge variant="info">Meta de dominio: {threshold}%</Badge> : undefined} />
  <div className="cm-chart-area">
    {error ? <ErrorState description="No pudimos cargar la tendencia de calidad." action={retry} /> : data.length < 2 ? <EmptyState description="Aún no hay suficiente información para mostrar una tendencia." /> : <>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: -18, bottom: 0 }} accessibilityLayer>
          <CartesianGrid stroke="rgba(143,167,192,.14)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#8fa7c0', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis domain={[0, 100]} tick={{ fill: '#8fa7c0', fontSize: 10 }} tickLine={false} axisLine={false} width={36} tickFormatter={value => `${value}%`} />
          <RechartsTooltip content={<TrendTooltip />} cursor={{ stroke: 'rgba(31,214,255,.25)' }} />
          {threshold !== null && <ReferenceLine y={threshold} stroke="#f6b73c" strokeDasharray="5 5" label={{ value: `${threshold}%`, fill: '#f6b73c', fontSize: 9, position: 'insideTopRight' }} />}
          <Line type="monotone" dataKey="score" stroke="#1fd6ff" strokeWidth={2.5} dot={{ r: 3, fill: '#061224', stroke: '#1fd6ff', strokeWidth: 2 }} activeDot={{ r: 5 }} animationDuration={450} />
        </LineChart>
      </ResponsiveContainer>
      <p className="sr-only">La tendencia contiene {data.length} periodos. Último resultado: {data.at(-1)?.score}% con {data.at(-1)?.count} evaluaciones.</p>
    </>}
  </div>
</Card>;

export const CompanyDistributionCard: React.FC<{ data: DistributionItem[]; error?: string; loading?: boolean }> = ({ data, error, loading }) => loading ? <ChartSkeleton /> : <Card className="cm-exec-distribution">
  <CardHeader title="Distribución por empresa" description="Participación de evaluaciones con empresa resuelta." />
  <div className="cm-chart-area cm-chart-area--compact">
    {error ? <ErrorState description="No pudimos cargar la distribución por empresa." action={retry} /> : !data.length ? <EmptyState description="No hay evaluaciones asociadas a empresas en este alcance." /> : <>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }} accessibilityLayer>
          <CartesianGrid stroke="rgba(143,167,192,.12)" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={82} tick={{ fill: '#b9cce0', fontSize: 9 }} tickLine={false} axisLine={false} />
          <RechartsTooltip cursor={{ fill: 'rgba(31,214,255,.05)' }} content={({ active, payload }) => active && payload?.[0] ? <div className="cm-chart-tooltip"><b>{String(payload[0].payload.name)}</b><span>Evaluaciones: {Number(payload[0].payload.count)}</span><span>Participación: {Number(payload[0].payload.percentage)}%</span></div> : null} />
          <Bar dataKey="count" fill="#2f7fff" radius={[0, 5, 5, 0]} animationDuration={450} />
        </BarChart>
      </ResponsiveContainer>
      <div className="cm-chart-legend">{data.map(item => <span key={item.id}><i />{item.name}: <b>{item.count}</b> ({item.percentage}%)</span>)}</div>
    </>}
  </div>
</Card>;

export const EvaluationStatusCard: React.FC<{ data: StatusItem[]; error?: string; loading?: boolean }> = ({ data, error, loading }) => {
  if (loading) return <ChartSkeleton />;
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return <Card className="cm-exec-status"><CardHeader title="Estado de evaluaciones" description="Dimensión: validación" />
    <div className="cm-exec-status__content">
      {error ? <ErrorState description="No pudimos cargar los estados de validación." action={retry} /> : !data.length ? <EmptyState description="No hay estados de evaluación para este alcance." /> : <>
        <div className="cm-status-stack" aria-label={`Distribución de ${total} evaluaciones`}>{data.map(item => <i key={item.id} className={`is-${item.tone}`} style={{ width: `${item.count / total * 100}%` }} title={`${item.label}: ${item.count}`} />)}</div>
        <div className="cm-status-list">{data.map(item => <div key={item.id}><Badge variant={item.tone} dot>{item.label}</Badge><span>{item.count}</span><small>{Math.round(item.count / total * 100)}%</small></div>)}</div>
      </>}
    </div>
  </Card>;
};
