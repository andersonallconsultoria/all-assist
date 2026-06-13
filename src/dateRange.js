export function buildCissDateRange(config, now = new Date()) {
  if (config.ciss.dtIni && config.ciss.dtFim) {
    return {
      dtIni: config.ciss.dtIni,
      dtFim: config.ciss.dtFim
    };
  }

  return {
    dtIni: formatDate(addDays(now, -config.ciss.lookbackDays)),
    dtFim: formatDate(addDays(now, config.ciss.lookaheadDays))
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
