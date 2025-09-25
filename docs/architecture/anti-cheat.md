# Anti-Triche & Fairness

## Surfaces d'Attaque
- Deviner réponses (fuite client)
- Spoof temps réponse
- Multi-comptes boost
- Flood réactions / answers
- Manipulation code session

## Principes
- Serveur = source de vérité
- Temps serveur > temps client
- Minimisation données côté client
- Surveillance comportementale

## Mécanismes
| Menace | Mesure |
|--------|--------|
| Lecture réponses avant reveal | Jamais transmettre is_correct avant reveal |
| Spoof timestamp | Ignorer timestamp client pour score vitesse (offset contrôlé) |
| Multi answers | Index unique (player, question, session) |
| Bot spam | Rate limit + blocage pattern (answers/sec) |
| Multi comptes | Corrélation IP + device (soft flag) |
| Injection code session | Codes aléatoires non séquentiels |

## Flags & Scores de Risque
- speedImprobable
- perfectStreakLong
- duplicateDevice
- answerBurst

Score de risque agrégé (0–100) => seuils: 60 (review), 80 (diminuer bonus vitesse), 90 (annuler power-ups).

## Actions Graduées
1. Observation (logs)
2. Avertissement (message discret)
3. Réduction partielle bonus vitesse
4. Isolation (score séparé non affiché aux autres)
5. Ban soft (empêche XP)

## Données Collectées (Minimales)
- IP hashée (SHA256 + salt rotatif quotidien)
- User agent
- Latence observée
- Patterns réponses

## Futur
- Modèle ML simple (isolation forest) sur vecteurs [latence moyenne, variance, ratio correct, delta vitesse]
- Partage blacklist distribué (option)
