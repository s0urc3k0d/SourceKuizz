# Scoring & Algorithmes

## Objectifs
- Récompenser justesse + rapidité
- Encourager régularité (streak)
- Prévenir exploitation (anti-abus)

## Formule (MVP)
```
if !correct => 0
speedFactor = max(0, 1 - timeMs / limitMs)
base = 100
streakBonus = 15 * min(streak, 10)
score = round(base + base * 0.5 * speedFactor + streakBonus)
```

## Paramètres Ajustables
- base (80–120)
- poids vitesse (0.3–0.7 * base)
- multiplicateur streak (linéaire vs palier)

## Extensions Futures
- Diminution progressive de bonus vitesse (anti rush extrême)
- Score adaptatif (pondérer selon difficulté question)
- Bonus teamplay (ex: moyenne équipe élevée)

## Intégrité Données
- Calcul côté serveur uniquement
- Journalisation: (playerId, questionId, rawLatency, adjustedLatency, scoreAwarded)
- Recalculation batch possible (idempotent)

## Détection Anomalies
- Latence <80ms répétée => flag
- Variation brutale score/streak improbable
- Réponses parfaites > X écarts-types au-dessus moyenne

## Pseudo-code
```ts
export function computeScore(params) {
  const { correct, timeMs, limitMs, streak } = params;
  if (!correct) return 0;
  const speedFactor = Math.max(0, 1 - timeMs / limitMs);
  const base = 100;
  const streakBonus = 15 * Math.min(streak, 10);
  return Math.round(base + base * 0.5 * speedFactor + streakBonus);
}
```

## Recalculation API (Future)
- Endpoint admin: POST /sessions/:id/recompute-scores
- Recalcule sur PlayerAnswer et régénère ScoreAggregate

## Stockage Intermédiaire
- Score par joueur maintenu en mémoire + Redis (clé session:score:<id>)
- Flush fin session vers table ScoreAggregate
