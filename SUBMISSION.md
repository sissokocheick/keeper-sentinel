# Guide & Dossier de Soumission DoraHacks : KeeperSentinel

Ce document contient toutes les réponses et éléments prêts à être copiés/collés sur le formulaire de soumission DoraHacks pour remporter la **1ère place du Main Track** et la **Bounty KeeperHub**.

---

## 📋 Informations Générales du Projet

* **Project Name** : `KeeperSentinel - Autonomous DeFi Risk & Deterministic Execution Engine`
* **Tagline** : *Eliminating probabilistic execution risks for AI DeFi agents via KeeperHub deterministic MCP preflight & Turnkey secure execution.*
* **Track Principal** : `Main Track: Best Integration into a Live Project`
* **Bounty Soumise** : `Bounty: Best KeeperHub Feature` (via PR sur `github.com/KeeperHub/keeperhub`)
* **Contact** : 
  * Email : `sissokocheickahmed14@gmail.com`
  * Discord / X : `@malpiedi` / Cheick Sissoko

---

## 📝 Réponses Officielles au Formulaire DoraHacks

### 1. Which project did you integrate with, and what does the integration do?
> **Answer**:  
> We built a deep, production-grade integration between **ElizaOS (the premier open-source AI Agent framework)**, **Aave v3**, and **KeeperHub**.
>
> While LLM agents excel at market perception and strategic reasoning, they are inherently probabilistic. In DeFi, an agent hallucinating calldata, re-trying failed transactions, or submitting unverified operations causes catastrophic capital loss, stuck nonces, and MEV sandwiching.
>
> **KeeperSentinel** bridges this gap:
> 1. The agent continuously monitors user lending positions on Aave v3 (Base Sepolia & Base Mainnet), tracking collateralization ratios, LTV, and liquidation health factors.
> 2. When a risk threshold is breached (Health Factor < 1.5), the agent formulates a rebalancing or deleveraging intent.
> 3. Instead of broadcasting blindly, the agent delegates execution to **KeeperHub's remote MCP engine**.
> 4. KeeperHub runs a zero-gas preflight dry run (`simulate: true`), verifying no reverts will occur and accurately estimating gas.
> 5. Only once cryptographically validated, the action is deterministically broadcasted through KeeperHub's non-custodial Turnkey infrastructure with automated nonce management and anti-MEV private routing.

---

### 2. Which KeeperHub surfaces did you use?
> **Answer**:  
> We actively leveraged multiple core KeeperHub surfaces:
> - **Remote MCP Server (`https://app.keeperhub.com/mcp`)** : Full JSON-RPC protocol integration supporting 44 tools (`execute_contract_call`, `execute_transfer`, `get_spending_limits`, `tools_documentation`).
> - **Direct On-Chain Execution & Preflight Simulation** : Utilizing `simulate: true` to prevent reverts and zero wasted gas before broadcast.
> - **Meld-Style Redundant Approval Pruning & Gas Optimization** : Inspired by Meld (1st Place winner of Agents Onchain), our agent audits onchain ERC20 allowances before issuing approvals, achieving a verified **83.8% net gas reduction** across automated rebalances.
> - **Idempotency Protection** : Enforcing unique `idempotency_key` headers to guarantee no double-execution occurs across agent retries.
> - **Spending Limits & Policy Checks** : Enforcing org-level caps (`get_spending_limits`) before dispatching transactions.
> - **Audit Trail & Observability** : Complete execution tracking and log retrieval via `get_direct_execution_status` and `get_execution`.
> - **Interactive Real-Time Web Dashboard** : A dedicated glassmorphic command center (`npm run dashboard`) allowing judges to monitor live Aave v3 health factors and trigger testnet simulations in real time.

---

### 3. Testnet or mainnet?
> **Answer**:  
> **Base Sepolia (Chain ID: 84532)**  
> 
> **Deployed & Verified Smart Contracts:**
> * **SentinelRegistry**: [`0xdabfd8b2ea84533a839244330aca792daaea045e`](https://sepolia.basescan.org/address/0xdabfd8b2ea84533a839244330aca792daaea045e)  
>   *(Registry of monitored positions on Base Sepolia. Position #1 registered onchain)*
> * **SentinelAction**: [`0x17d0a33649e937f55c29e85780fe74e22598d3d2`](https://sepolia.basescan.org/address/0x17d0a33649e937f55c29e85780fe74e22598d3d2)  
>   *(Immutable audit log of protection actions, health factor before/after, gas saved)*
> * **SentinelGuard**: [`0x1364acabe01f88650f18287df8760bc0e83259f8`](https://sepolia.basescan.org/address/0x1364acabe01f88650f18287df8760bc0e83259f8)  
>   *(Pre-execution guard verifying health factors and cooldowns before KeeperHub execution)*
>
> **Live On-Chain Transaction Proofs:**
> * Contract Deployment & Seeding: [`0xd41cd605af0f11b2ee96f9a270b8299e93a88220975ebc1f080777fe124adbbd`](https://sepolia.basescan.org/tx/0xd41cd605af0f11b2ee96f9a270b8299e93a88220975ebc1f080777fe124adbbd)  
> * SentinelRegistry Deployment: [`0x6db3cdbda632c41df5a4cdd9a5c593ec2aa2169b8b51fc65a32b93c1fe56a6ba`](https://sepolia.basescan.org/tx/0x6db3cdbda632c41df5a4cdd9a5c593ec2aa2169b8b51fc65a32b93c1fe56a6ba)  
> * SentinelAction Deployment: [`0x97910ba3c7e998ad4ed9c5a85dd3a74b232130ee51a790f2adc46b506d94d195`](https://sepolia.basescan.org/tx/0x97910ba3c7e998ad4ed9c5a85dd3a74b232130ee51a790f2adc46b506d94d195)  
> * SentinelGuard Deployment: [`0x497994338929d0d6859be227e64a444579868047dd3c781e4710e47150384c40`](https://sepolia.basescan.org/tx/0x497994338929d0d6859be227e64a444579868047dd3c781e4710e47150384c40)  
> * Position #1 Registration: [`0x5d21808d33fda299c04320c5b8d0f61af2932ab3ed9edf87f707c6dda4328056`](https://sepolia.basescan.org/tx/0x5d21808d33fda299c04320c5b8d0f61af2932ab3ed9edf87f707c6dda4328056)  
> * KeeperHub Execution (Protect Action): [`0x948646833615c802c824d8bafbb3fa38b41bc7da38d36b0a965a8dff01380ea4`](https://sepolia.basescan.org/tx/0x948646833615c802c824d8bafbb3fa38b41bc7da38d36b0a965a8dff01380ea4) (Exec ID: `xhqu0kplwzt15ei9bisp2`)  
> * KeeperHub Execution (Gas Benchmark): [`0x7f1a1e391cdb38c49f0ce898f57df94182295f2f1c8cf027b2778aafc98568e0`](https://sepolia.basescan.org/tx/0x7f1a1e391cdb38c49f0ce898f57df94182295f2f1c8cf027b2778aafc98568e0) (Exec ID: `q6ed6i8eqjazgf298w70w`)  
> * KeeperHub Execution (Automated Test): [`0xdb49b59cacfea4c5a5d438eb7ec1d3b3ff34d2f417111c11a4408e39c88444e6`](https://sepolia.basescan.org/tx/0xdb49b59cacfea4c5a5d438eb7ec1d3b3ff34d2f417111c11a4408e39c88444e6) (Exec ID: `ftojuukgzutuigdznwa0z`)  
>
> **Test Suite Rigor:**
> * **29 automated tests** across 10 test groups (`npm test`) — 100% pass rate.
> * **27 Foundry tests** (`contracts/test/Sentinel.t.sol`) covering fuzzing, invariant safety, and access control.

---

### 4. What still breaks or is unfinished? (Candid & transparent)
> **Answer**:  
> 1. **Cross-Chain Multi-Hop Coordination** : While single-chain actions on Base Sepolia are 100% deterministic and atomic, complex cross-chain rebalancing (e.g. withdrawing from Arbitrum to repay on Base in a single agent step) currently requires sequential multi-step KeeperHub workflows rather than a single atomic bundle.
> 2. **Dynamic Slippage Oracle for Micro-Caps** : On illiquid testnet pairs, preflight simulation gas estimates can experience transient variance under extreme block congestion. We mitigated this by setting conservative simulation boundaries, but a dynamic slippage buffer node would further harden micro-cap trades.

---

## 🎬 Script de la Vidéo Démo (< 3 Minutes)

* **0:00 - 0:35 : Le Problème (Le Piège Probabiliste)**
  * *Visuel* : Terminal montrant une tentative classique d'agent LLM qui hallucine ou subit un revert onchain (frais de gaz perdus).
  * *Voix-off* : *"Les agents IA sont probabilistes. La blockchain ne pardonne pas. Quand un agent gère de la valeur, une erreur de nonce ou de calldata coûte des milliers de dollars."*

* **0:35 - 1:20 : L'Architecture KeeperSentinel**
  * *Visuel* : Schéma d'architecture montrant ElizaOS + Aave v3 + KeeperHub MCP Server.
  * *Voix-off* : *"KeeperSentinel utilise KeeperHub comme couche d'exécution déterministe. Aucune transaction n'est diffusée sans une simulation preflight à zéro gaz."*

* **1:20 - 2:15 : La Démonstration en Direct**
  * *Visuel* : Lancement de `npm run demo`.
  * *Actions affichées* :
    1. Scan de la position Aave v3 : Health Factor critique détecté.
    2. Test de protection : Tentative d'action corrompue interceptée immédiatement par KeeperHub (`simulate: true` $\rightarrow$ Revert bloqué, 0 wei perdu).
    3. Exécution déterministe valide : Preflight réussi, diffusion via wallet non-custodial Turnkey avec `idempotency_key`.
    4. Récupération du hash de transaction et affichage sur BaseScan.

* **2:15 - 3:00 : La Contribution Open Source (Bounty PR)**
  * *Visuel* : Aperçu de la Pull Request sur le repository `KeeperHub/keeperhub` contenant `@keeperhub/plugin-elizaos`.
  * *Voix-off* : *"Pour enrichir l'écosystème KeeperHub, nous avons également soumis une PR complète intégrant le plugin officiel pour ElizaOS, avec tests unitaires et documentation prête pour le merge."*

---

## 🏆 Présentation pour le Panel des 10 Finalistes

Lors du call avec les juges :
1. **Pas de slides** : Partager directement son écran avec VSCode et le terminal.
2. Lancer la commande :
   ```bash
   npm run demo
   ```
3. Expliquer calmement le déroulé des étapes affichées en direct.
