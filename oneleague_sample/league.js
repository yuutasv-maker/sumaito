export function calculateStandings(teams, matches, points = { win: 3, draw: 1, loss: 0 }) {
  const rows = new Map(
    teams.map((team, index) => [
      team.id,
      {
        ...team,
        index,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        difference: 0,
        points: 0,
      },
    ])
  );

  for (const match of matches) {
    if (match.status !== 'finished') continue;

    const home = rows.get(match.home);
    const away = rows.get(match.away);

    if (
      !home ||
      !away ||
      home === away ||
      !Number.isInteger(match.homeScore) ||
      !Number.isInteger(match.awayScore) ||
      match.homeScore < 0 ||
      match.awayScore < 0
    ) {
      continue;
    }

    home.played++;
    away.played++;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore === match.awayScore) {
      home.drawn++;
      away.drawn++;
      home.points += points.draw;
      away.points += points.draw;
    } else {
      const winner = match.homeScore > match.awayScore ? home : away;
      const loser = winner === home ? away : home;
      winner.won++;
      loser.lost++;
      winner.points += points.win;
      loser.points += points.loss;
    }
  }

  const sorted = [...rows.values()]
    .map(row => ({
      ...row,
      difference: row.goalsFor - row.goalsAgainst,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.difference - a.difference ||
        b.goalsFor - a.goalsFor ||
        a.index - b.index
    );

  return sorted.map((row, i) => ({
    ...row,
    rank:
      i &&
      row.points === sorted[i - 1].points &&
      row.difference === sorted[i - 1].difference &&
      row.goalsFor === sorted[i - 1].goalsFor
        ? sorted.findIndex(
            r =>
              r.points === row.points &&
              r.difference === row.difference &&
              r.goalsFor === row.goalsFor
          ) + 1
        : i + 1,
  }));
}

export function filterMatches(matches, { status, team = 'all', round = 'all' } = {}) {
  return matches
    .filter(
      m =>
        (!status || m.status === status) &&
        (team === 'all' || m.home === team || m.away === team) &&
        (round === 'all' || m.round === Number(round))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export function getStandingsCaption(matches, { demo = false } = {}) {
  const finished = matches.filter(m => m.status === 'finished');
  const prefix = demo ? 'サンプル ' : '';

  if (!finished.length) {
    return `${prefix}シーズン開幕前`;
  }

  const maxRound = Math.max(...finished.map(m => m.round));
  const inMaxRound = matches.filter(m => m.round === maxRound);
  const finishedInMax = inMaxRound.filter(m => m.status === 'finished');

  if (inMaxRound.length > 0 && finishedInMax.length < inMaxRound.length) {
    return `${prefix}第${maxRound}節・${finishedInMax.length}/${inMaxRound.length}試合終了`;
  }

  const unplayedPrior = matches.filter(
    m => m.round < maxRound && m.status !== 'finished'
  ).length;

  if (unplayedPrior > 0) {
    return `${prefix}第${maxRound}節終了時点（未消化${unplayedPrior}試合）`;
  }

  return `${prefix}第${maxRound}節終了時点`;
}
