# Demo video script (target 3 minutes, hard limit 4)

ETHGlobal rules: 2 to 4 minutes, 720p or better, your own voice, no music-only, no AI voiceover, not recorded on a phone, no speed-up. Show the paid request executing.

The video follows `/demo` step by step. Every step prefills its own inputs and shows the sentence to say under the card. Press Next (or the right arrow key) to advance.

## Before recording

* `npm run dev` running: seller (4402), auditor (4404), dashboard API (4403), site (4405). Both listings registered, `LLM_PROVIDER=groq` or `anthropic`.
* `AUDIT_TOPIC_ID` and `REPUTATION_TOPIC_ID` set, and one audit already on the topic (run `npm run buyer -- audit agora-seller-1` once) so the replay switch has something to play if the model is slow.
* Open http://localhost:4405/demo at 1440 by 900. Click "Reset the take" so spent reads 0.
* HashScan open in a second tab on the audit topic and the receipts topic.

## 0:00 to 0:20  Step 0, the problem

Read the four bullets. "Agora402: discover, verify, negotiate, pay, prove. On Hedera, per request."

## 0:20 to 0:40  Step 1, discover

Point at the three cards: the services seller, the auditor, any third party. Each is an HCS message paid for by the account it names. Open the registry topic on HashScan for two seconds.

## 0:40 to 1:20  Step 2, verify

Click "Pay the auditor and run the audit". Narrate the left rail (the buyer pays the auditor 0.01 HBAR over x402) then the right rail as the four stages land: manifest, payment integrity, description review, verdict. The attestation card appears: safe, trust 100, written to the audit topic by the auditor account. If the model is slow, tick the replay switch and play the last audit back from the mirror node instead.

## 1:20 to 1:50  Step 3, negotiate and pay

Click "Discover, negotiate, pay". Narrate: verified seller ranked first, signed quote at 90 percent of list, a 402 for exactly that amount, one transfer signed by the buyer, Blocky402 settles and pays the fee, mirror node confirms. The answer appears.

## 1:50 to 2:10  Step 4, prove the payment

The settlement ledger: buyer debited, seller credited, facilitator paid the network fee. List price, signed quote and the 402 amount side by side.

## 2:10 to 2:35  Step 5, metering

Click "Pay for the longer request". The 402 is higher because the price is computed from the request. Compare the two amounts and the token counts.

## 2:35 to 3:05  Step 6, receipts and rating

Receipts table: every settlement with the chain match column. Click five stars and "Record the rating". The rating cites the settlement from step 3; the seller's card updates with the rating.

## 3:05 to 3:25  Step 7, what Hedera gave us

Read the four bullets.

## 3:25 to 3:40  Step 8, close

Repo, tests offline, roadmap.
