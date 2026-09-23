import React from 'react';
import { SPEECH_TYPIFICATIONS, type SpeechTypificationFilter as FilterValue } from '../../utils/speechTypification';

export const SpeechTypificationFilter: React.FC<{value:FilterValue;onChange:(value:FilterValue)=>void}> = ({value,onChange}) =>
  <label className="inline-flex items-center gap-2 text-xs font-semibold">Tipificación SA
    <select className="cm-select px-3 py-2" value={value} onChange={event=>onChange(event.target.value as FilterValue)}>
      <option value="ALL">Todas las tipificaciones</option>
      {SPEECH_TYPIFICATIONS.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}
      <option value="SIN_TIPIFICACION">Sin tipificación (cargas anteriores)</option>
    </select>
  </label>;
