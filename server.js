const express = require('express');
const fs = require('fs');

const BANK = 100; // banca fija para calculo de stakes
let oddsData = [];

async function fetchOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  if (apiKey) {
    try {
      const url = `https://api.the-odds-api.com/v4/sports/soccer/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      oddsData = await res.json();
      fs.mkdirSync('data',{recursive:true});
      fs.writeFileSync('data/odds.json', JSON.stringify(oddsData, null, 2));
      return;
    } catch (err) {
      console.error('Error fetching API, using sample data', err.message);
    }
  }
  oddsData = JSON.parse(fs.readFileSync('sample-odds.json', 'utf-8'));
}

function computeArbitrage() {
  const opportunities = [];
  for (const event of oddsData) {
    const best = {
      home: { price: 0, bookie: null },
      draw: { price: 0, bookie: null },
      away: { price: 0, bookie: null }
    };

    for (const book of event.bookmakers || []) {
      const market = (book.markets || []).find(m => m.key === 'h2h');
      if (!market) continue;
      for (const o of market.outcomes) {
        const key = o.name === 'Draw'
          ? 'draw'
          : (o.name === event.home_team ? 'home' : 'away');
        if (o.price > best[key].price) {
          best[key] = { price: o.price, bookie: book.title };
        }
      }
    }

    if (!best.home.price || !best.draw.price || !best.away.price) continue;

    const invSum = 1 / best.home.price + 1 / best.draw.price + 1 / best.away.price;
    const margin = 1 - invSum;
    if (margin > 0) {
      let sH = BANK * (1 / best.home.price) / invSum;
      let sD = BANK * (1 / best.draw.price) / invSum;
      let sA = BANK * (1 / best.away.price) / invSum;
      sH = Math.round(sH * 100) / 100;
      sD = Math.round(sD * 100) / 100;
      sA = Math.round(sA * 100) / 100;
      const S = sH + sD + sA;
      const payout = Math.min(sH * best.home.price, sD * best.draw.price, sA * best.away.price);
      const profit = payout - S;
      opportunities.push({
        event: `${event.home_team} vs ${event.away_team}`,
        commence_time: event.commence_time,
        best,
        stake: { home: sH, draw: sD, away: sA },
        payout,
        profit,
        margin
      });
    }
  }
  return opportunities;
}

const app = express();
app.use(express.static('.'));

app.get('/api/arbitrage', async (req, res) => {
  await fetchOdds();
  res.json(computeArbitrage());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
