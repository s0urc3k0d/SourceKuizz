# Sécurité & Anti-Triche

## Authentification
- Pseudo / mot de passe (Argon2id)
- OAuth Twitch (scope minimal user:read:email optionnel)
- JWT court (15 min) + Refresh rotatif (hashé en DB)
- Invalidation refresh sur logout / suspicion

## Stockage Secrets
- Variables env (dotenv en dev, vault en prod)
- Clés JWT asymétriques (RS256) rotation planifiée

## Durcissement API
- Rate limiting (IP + user) via Redis token bucket
- Validation stricte (Zod) sur chaque entrée
- Journaux: pas de mot de passe / token
- CSP stricte + X-Frame-Options (ALLOW-FROM Twitch si nécessaire overlay)

## Sécurité Questions / Réponses
- Jamais envoyer solutions avant reveal
- Hachage interne des réponses correctes en mémoire
- Anti enumeration: codes de session aléatoires (base32, 6-8 chars)

## Anti-Triche Réponses
- Timestamp serveur autoritaire
- Latence compensée contrôlée
- Double answer block: unique index (session, question, player)
- Drapeaux: trop rapide, répétitif, pattern improbable

## Protection Données
- Password: Argon2id (memory ≥ 64MB, time calibré <300ms)
- Minimisation PII (stockage email Twitch optionnel)

## Logs & Traçabilité
- Correlation-ID par requête (x-request-id)
- Niveau: info, warn, error, security
- Export vers SIEM (option future)

## Monitoring Sécurité
- Alertes: 401/403 surge, 429 spike, anomalies latence
- Tableau anomalies joueurs (score improbable vs médiane)

## Checklist Initiale
- [ ] Hash Argon2id paramétré
- [ ] Rotation refresh tokens
- [ ] Rate limit login (5 / 5 min)
- [ ] CSP
- [ ] Sanitisation contenu HTML (éditeur quiz)
- [ ] Validation taille uploads
- [ ] Logs structurés JSON

## Évolutions Futures
- Device fingerprint doux (pas bloquant)
- ML simple sur fraude scoring
- Captcha adaptatif uniquement sur abuse détecté
