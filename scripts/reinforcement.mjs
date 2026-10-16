export function chooseReinforcement(units) {
  const living = units.filter(u => u.active && u.hp > 0 && u.state !== 'Dead');
  const ranked = ['A', 'B', 'C'].map(id => ({ id,
    humans: living.filter(u => u.faction === 'human' && u.routeId === id).length,
    zombies: living.filter(u => u.faction === 'zombie' && u.routeId === id),
  }));
  const tie = (a, b) => a.id.localeCompare(b.id);
  const source = ranked.filter(r => r.humans > 0 && !r.zombies.some(u => u.breached))
    .sort((a, b) => b.humans - a.humans || tie(a, b))[0]?.id ?? null;
  const target = source === null ? null : ranked.filter(r => r.id !== source)
    .sort((a, b) => b.zombies.length - a.zombies.length || tie(a, b))[0].id;
  return { source, target };
}
