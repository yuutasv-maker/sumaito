import {calculateStandings, filterMatches} from './league.js';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data, standings, teamMap;
const color = value => /^#[\da-f]{6}$/i.test(value) ? value : '#577646';
const badge = team => `<span class="badge" style="--team-color:${color(team.color)}" aria-hidden="true">${escapeHTML(team.mark)}</span>`;
function setTab(name, focus = false) {
  if (!['standings', 'schedule', 'results'].includes(name)) return;
  $$('[data-tab]').forEach(tab => { const active = tab.dataset.tab === name; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; if (active && focus) tab.focus(); });
  $$('.tab-panel').forEach(panel => panel.hidden = panel.id !== `panel-${name}`);
  $$('.mobile-bottom [data-tab-link]').forEach(a => a.classList.toggle('active', a.dataset.tabLink === name));
}
$$('[data-tab]').forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));
$('.tabs').addEventListener('keydown', e => {
  const tabs = $$('[data-tab]'), index = tabs.indexOf(document.activeElement);
  if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return;
  e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  setTab(tabs[next].dataset.tab, true);
});
$$('[data-tab-link]').forEach(a => a.addEventListener('click', () => setTab(a.dataset.tabLink)));
const menu = $('#mobile-menu'), toggle = $('.menu-toggle');
function closeMenu(){ menu.hidden = true; toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','メニューを開く'); }
toggle.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; toggle.setAttribute('aria-expanded',String(open)); toggle.setAttribute('aria-label',open ? 'メニューを閉じる' : 'メニューを開く'); });
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => { if(e.key === 'Escape' && !menu.hidden){closeMenu();toggle.focus();} });
matchMedia('(min-width:901px)').addEventListener('change', e => {if(e.matches)closeMenu();});
function renderStandings(){
  const finished = data.matches.filter(m => m.status === 'finished');
  $('#standings-caption').textContent = finished.length ? `${data.mode === 'demo' ? 'サンプル ' : ''}第${Math.max(...finished.map(m => m.round))}節終了時点` : 'シーズン開幕前';
  $('#standings-list').innerHTML = `<div class="standings-header" aria-hidden="true"><span>順位</span><span>チーム</span><span>勝点</span><span class="desktop-stat">試合</span><span class="desktop-stat">勝</span><span class="desktop-stat">分</span><span class="desktop-stat">負</span><span class="desktop-stat">得点</span><span class="desktop-stat">失点</span><span>得失差</span><span></span></div>${standings.map(row => `<div class="standing-item"><button class="standing-row" aria-expanded="false" aria-controls="detail-${escapeHTML(row.id)}" aria-label="${escapeHTML(row.name)}、${row.rank}位、勝点${row.points}、成績の詳細"><span class="rank">${String(row.rank).padStart(2,'0')}</span><span class="team-cell">${badge(row)}<span>${escapeHTML(row.name)}</span></span><span class="points">${row.points}</span><span class="desktop-stat">${row.played}</span><span class="desktop-stat">${row.won}</span><span class="desktop-stat">${row.drawn}</span><span class="desktop-stat">${row.lost}</span><span class="desktop-stat">${row.goalsFor}</span><span class="desktop-stat">${row.goalsAgainst}</span><span>${row.difference > 0 ? '+' : ''}${row.difference}</span><span class="row-plus" aria-hidden="true">＋</span></button><div id="detail-${escapeHTML(row.id)}" class="row-details" hidden><span>試合<b>${row.played}</b></span><span>勝<b>${row.won}</b></span><span>分<b>${row.drawn}</b></span><span>負<b>${row.lost}</b></span><span>得点<b>${row.goalsFor}</b></span><span>失点<b>${row.goalsAgainst}</b></span></div></div>`).join('')}`;
  $$('.standing-row').forEach(button => button.addEventListener('click', () => { const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded',String(open)); document.getElementById(button.getAttribute('aria-controls')).hidden = !open; button.querySelector('.row-plus').textContent = open ? '−' : '＋'; }));
}
function dateLabel(date){ return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(`${date}T12:00:00+09:00`)); }
function renderMatches(target, matches){
  if (!matches.length) { $(target).innerHTML = '<p class="empty-state">該当する試合はありません。<br>詳細は決定次第お知らせします。</p>'; return; }
  let lastGroup = '';
  $(target).innerHTML = matches.map(match => {
    const home = teamMap.get(match.home), away = teamMap.get(match.away);
    if(!home || !away) return '';
    const key = `${match.round}-${match.date}`;
    const title = lastGroup !== key ? `<div class="match-group-title">${dateLabel(match.date)}<span>第${match.round}節${data.mode === 'demo' ? ' / DEMO' : ''}</span></div>` : '';
    lastGroup = key;
    return `${title}<article class="match-card" aria-label="${escapeHTML(home.name)} 対 ${escapeHTML(away.name)}"><div class="match-meta"><span>${match.status === 'finished' ? '試合終了' : `${escapeHTML(match.time)} KICK OFF`}</span><span>${escapeHTML(match.venue)}</span></div><div class="match-pair"><span class="match-team">${badge(home)}<span>${escapeHTML(home.name)}</span></span><strong class="match-score ${match.status === 'finished' ? '' : 'vs'}">${match.status === 'finished' ? `${match.homeScore} - ${match.awayScore}` : 'VS'}</strong><span class="match-team away">${badge(away)}<span>${escapeHTML(away.name)}</span></span></div></article>`;
  }).join('');
}
function renderSchedule(){renderMatches('#schedule-list',filterMatches(data.matches,{status:'scheduled',team:$('#schedule-team').value}));}
function renderResults(){renderMatches('#results-list',filterMatches(data.matches,{status:'finished',round:$('#results-round').value}));}
function renderTeams(){
  $('#teams-grid').innerHTML = data.teams.map((team,i) => `<button class="team-card" data-team="${escapeHTML(team.id)}" aria-label="${escapeHTML(team.name)}の紹介を見る">${badge(team)}<span><h3>${escapeHTML(team.name)}</h3><small>TEAM ${String(i+1).padStart(2,'0')}${data.mode === 'demo' ? ' / DEMO' : ''}</small></span><span aria-hidden="true">↗</span></button>`).join('');
  $$('.team-card').forEach(button => button.addEventListener('click', () => {
    const team = teamMap.get(button.dataset.team), row = standings.find(r => r.id === team.id);
    $('#team-dialog-content').innerHTML = `<div class="dialog-team-head">${badge(team)}<div><h2 id="team-dialog-title">${escapeHTML(team.name)}</h2><p>ONE LEAGUE 2027${data.mode === 'demo' ? ' / DEMO TEAM' : ''}</p></div></div><p class="dialog-copy">${escapeHTML(team.comment)}</p><div class="dialog-stats"><span>順位<b>${row.rank}</b></span><span>勝点<b>${row.points}</b></span><span>試合数<b>${row.played}</b></span></div>${data.mode === 'demo' ? '<p class="dialog-note">このチーム名・紹介文・成績は表示サンプルです。実在の参加チームではありません。</p>' : ''}`;
    $('#team-dialog').showModal();
  }));
}
$('.dialog-close').addEventListener('click', () => $('#team-dialog').close());
$('#team-dialog').addEventListener('click',e=>{if(e.target === $('#team-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
$('#schedule-team').addEventListener('change',renderSchedule);
$('#results-round').addEventListener('change',renderResults);
async function loadData(){
  const state = $('#data-state'); state.hidden = false; state.textContent = 'リーグ情報を読み込んでいます…';
  try {
    const response = await fetch('data/league-data.json',{cache:'no-cache'});
    if(!response.ok)throw new Error('Unable to load league data');
    data = await response.json();
    if(!Array.isArray(data.teams)||!Array.isArray(data.matches))throw new Error('Invalid league data');
    teamMap = new Map(data.teams.map(team => [team.id,team]));
    standings = calculateStandings(data.teams,data.matches,data.points);
    $('#demo-notice').hidden = data.mode !== 'demo';
    $('#schedule-team').innerHTML = '<option value="all">全チーム</option>' + data.teams.map(team=>`<option value="${escapeHTML(team.id)}">${escapeHTML(team.name)}</option>`).join('');
    const rounds = [...new Set(data.matches.filter(m=>m.status==='finished').map(m=>m.round))].sort((a,b)=>b-a);
    $('#results-round').innerHTML = rounds.map(round=>`<option value="${round}">第${round}節</option>`).join('') + '<option value="all">すべての結果</option>';
    renderStandings();renderSchedule();renderResults();renderTeams();
    if(data.contact?.lineUrl && /^https:\/\/(lin\.ee|line\.me)\//.test(data.contact.lineUrl)){
      $('.contact-box h3').textContent='公式LINEから、お気軽にどうぞ。';
      $('.contact-box>p').textContent='リーグへのご質問、参加・見学のご相談を受け付けています。';
      $('#contact-actions').innerHTML=`<a class="button lime" href="${escapeHTML(data.contact.lineUrl)}" target="_blank" rel="noopener noreferrer">公式LINEで問い合わせる ↗</a>`;
    }
    state.hidden = true;
  } catch(error) {
    state.innerHTML = 'リーグ情報を読み込めませんでした。<br><button id="retry-data">もう一度読み込む</button>';
    $('#retry-data').addEventListener('click',loadData);
  }
}
setTab('standings');loadData();
