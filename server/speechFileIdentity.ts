const cleanName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]+/g, ' ').trim();

export const speechAdvisorIdentityFromFile = (fileName: string) => {
  const base = String(fileName || '').replace(/^.*[\\/]/, '');
  // In the legacy recording format, the first eight-digit token is a date, not a DNI.
  const legacy = /^\d+-O\d+-\d{8}-\d{6}-/i.test(base);
  const match = legacy ? null : base.match(/(?:^|_)(\d{8})(?=_|\.|$)/) || base.match(/(?<!\d)(\d{8})(?!\d)/);
  const prefix = match?.index === undefined ? '' : base.slice(0, match.index);
  const name = cleanName(prefix).toLocaleLowerCase('es-PE').replace(/(^|\s)(\p{L})/gu, (_, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase('es-PE')}`);
  return { dni: match?.[1] || '', name };
};

export const speechFileIdentityMatches = (fileNames: string[]) => {
  const trusted = fileNames.map(fileName => {
    const identity = speechAdvisorIdentityFromFile(fileName);
    const phone = fileName.match(/(?<!\d)(9\d{8})(?!\d)/)?.[1] || '';
    return { ...identity, phone, tokens: cleanName(identity.name).split(' ').filter(token => token.length >= 3) };
  }).filter(item => item.dni && item.phone && item.tokens.length >= 2);
  const matches = new Map<string, { dni: string; name: string }>();
  for (const fileName of fileNames) {
    if (speechAdvisorIdentityFromFile(fileName).dni) continue;
    const phone = fileName.match(/(?<!\d)(9\d{8})(?!\d)/)?.[1];
    const alias = cleanName(fileName.match(/\.([\p{L}]+)\.[^.]+$/u)?.[1] || '').replace(/\s/g, '');
    if (!phone || !alias) continue;
    const candidates = trusted.filter(item => item.phone === phone && item.tokens.some(left => item.tokens.some(right => left !== right && (left + right === alias || right + left === alias))));
    const distinctDnis = [...new Set(candidates.map(item => item.dni))];
    if (distinctDnis.length === 1) matches.set(fileName, { dni: distinctDnis[0], name: candidates[0].name });
  }
  return matches;
};
