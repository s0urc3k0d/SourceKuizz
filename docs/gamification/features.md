# Gamification & Fun

## Objectifs
- Fidéliser joueurs
- Rendre l'expérience dynamique
- Favoriser engagement stream (Twitch)

## Mécaniques Principales
- Streak bonus (multiplicateur progressif)
- Power-ups (inventaire limité)
- Réactions emojis temps réel
- Équipes & cumul points
- Boss Question (x3 points, chrono réduit)
- Challenges journaliers
- Badges & Succès (milestones)
- XP & Niveaux (déblocage cosmétiques)
- Mode Prediction (parier sur top performer)
- Spectator mode (après élimination ou pour viewers Twitch)
- Replay timeline (statistiques post-partie)

## Power-ups (Exemples)
| Code | Effet | Détails |
|------|-------|---------|
| REVEAL_HINT | Affiche distribution % sur 2 options les + choisies | Pas utilisable dernière seconde |
| DOUBLE_SCORE | Prochaine bonne réponse x2 | Expire si mauvaise réponse |
| SECOND_CHANCE | Deux réponses possibles, meilleure retenue | Limité questions non boss |
| FREEZE_TIME | +2s personnelle (pas global) | Une fois / session |

## Badges (Exemples)
- FirstBlood (première bonne réponse d'une session)
- Perfect10 (10 réponses parfaites vitesse + justesse)
- Comeback (remonte du hors top 10 → top 3)
- TeamPlayer (3 assists team — ex: indices partagés)

## Progression XP (Courbe Indicative)
- Base: 100 XP par bonne réponse
- + vitesse 0–50
- + streak 10*n (n = longueur streak cap 10)
- Niveaux: formule XP_total = 250 * level^1.35

## Personnalisation Débloquable
- Avatars / Frames / Animations réaction
- Thèmes interface joueur
- Effets reveal perso (cosmétique seulement)

## Intégration Twitch
- Commande chat !join CODE → lien auto
- Overlay scoreboard embed
- Emotes synchronisées comme réactions
- Drops (power-up rare via événements stream)

## Anti-Abus Gamification
- Limiter power-ups pay2win (cosmétique prioritaire)
- Cooldown sur réactions spam
- Pas d'XP sur parties privées < 3 joueurs uniques

## Roadmap Gamification Progressive
Phase 1: Streaks, leaderboard dynamique
Phase 2: Power-ups de base, réactions
Phase 3: Badges, XP, niveaux
Phase 4: Predictions, replays, cosmétiques avancés
Phase 5: Économie légère (craft / fusion power-ups rares?)
