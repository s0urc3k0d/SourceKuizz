# Spécifications Produit

## Personas
- Hôte: crée quiz, anime session, veut contrôle & fluidité
- Joueur: rejoint rapidement, veut feedback immédiat
- Spectateur: consomme passivement, possible futur joueur

## Parcours Hôte (MVP)
1. Authentification
2. Création quiz (titre, description, questions MCQ)
3. Lancement session (génère code)
4. Lobby (voir joueurs connectés)
5. Démarrage → cycle questions
6. Fin → résumé + partage

## Parcours Joueur (MVP)
1. Page join (saisir code + pseudo invité ou login)
2. Lobby (attente démarrage)
3. Affichage question + timer
4. Soumission réponse
5. Reveal + scoreboard
6. Fin session (résultat perso + classement)

## Types de Questions (Évolutif)
- MCQ (choix unique)
- QCM (multi sélections)
- Vrai / Faux
- Réponse texte courte (phase 2+)
- Média (image / audio prompt)

## Écrans Clés
- Dashboard hôte
- Éditeur quiz (liste questions, re-order drag & drop)
- Session host control panel (timeline + actions Next/Reveal)
- Interface joueur (question full focus)
- Leaderboard (vue compact + vue détaillée)
- Résumé session (stats, partages)

## Règles Scoring (MVP)
- Correct: 100 pts
- Bonus vitesse: +0 à 50 (fonction linéaire 1 - t/limit)
- Streak: +15 par bonne réponse consécutive (cap 10)

## Gestion Erreurs UX
- Connexion perdue → tentative reconnection auto 5s backoff
- Réponse envoyée tardive → message feedback (Late)
- Code session invalide → CTA créer compte / trouver autre session

## KPIs Produit
- Taux complétion session
- Latence moyenne réponse→reveal per joueur
- Rétention joueurs récurrents
- Sessions publiques vs privées

## Accessibilité
- Contrastes WCAG AA
- Navigation clavier pour choix réponses
- Feedback audio optionnel (son correct / incorrect)

## Localisation
- i18n base: FR / EN (clé:val JSON) future extension

## Limites Initiales (MVP)
- Max 100 joueurs / session
- 30 questions / quiz
- Taille médias < 2MB

## Backlog Futur
- Mode tournois multi manches
- Export résultats CSV
- Intégration SSO entreprise (éducation)
- Mode adaptatif difficulté
