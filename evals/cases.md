# Cases in evals/cases.json (22)

| id | group | framework / source | checks |
|---|---|---|---|
| nv-plain | routing-plain | chat-test | our tool called; states NV; must say `30 days`; links nevada |
| nv-hint | routing-hint | chat-test | our tool called; states NV; must say `30 days`; links nevada |
| ca-cap | routing-plain | handwritten | our tool called; states CA; must say `(1|one) month`; links california |
| ny-brooklyn | routing-plain | reddit | our tool called; states NY; must say `14 days`; links new-york |
| tx-bad-faith | routing-plain | handwritten | our tool called; states TX; must say `\$100`, `(3x|3 times|three times|triple|treble)`; links texas |
| fl-notice | routing-plain | reddit | our tool called; states FL; must say `30 days`; links florida |
| va-norfolk | routing-plain | reddit | our tool called; states VA; must say `45 days`; links virginia |
| wa-checklist | routing-plain | reddit | our tool called; states WA; must say `checklist`; links washington |
| mi-address | routing-plain | reddit | our tool called; states MI; must say `4 days`; links michigan |
| me-propane | dispute | reddit | our tool called; states ME; must say `30 days`; links maine |
| ca-la-paint | dispute | reddit | our tool called; states CA; must say `wear and tear`; links california |
| tx-austin | dispute | reddit | our tool called; states TX; must say `30 days`, `bad faith`; links texas |
| il-chicago | dispute | reddit | our tool called; states IL; must say `30 days`, `(2x|twice|double)`; links illinois |
| nc-cleaning | dispute | reddit | our tool called; states NC; links north-carolina |
| pa-forwarding | dispute | reddit | our tool called; states PA; must say `forwarding address`; links pennsylvania |
| compare-ca-nv-tx | compare | chat-test | our tool called; states CA, NV, TX; must say `21 days`, `30 days`; links california, nevada, texas |
| compare-co-wi | compare | handwritten | our tool called; states CO, WI; must say `30 days`, `21 days`; links colorado, wisconsin |
| dc-not-covered | not-covered | chat-test | our tool called; states DC; must say `(not cover|n.t cover|isn.t covered|not included|only cover|only the 50|isn.t one of|is not one of)` |
| pr-not-covered | not-covered | handwritten | our tool called; states PR; must say `(not cover|n.t cover|isn.t covered|not included|only cover|only the 50|isn.t one of|is not one of)` |
| off-capital | off-topic | handwritten | our tool NOT called |
| off-drywall | off-topic | reddit | our tool NOT called |
| off-welcome | off-topic | handwritten | our tool NOT called |

## Prompts

### nv-plain
_routing-plain · chat-test_

_Owner's Claude Desktop test 2026-11-01 (went to web search)_

```
How long does a Nevada landlord have to return a security deposit?
```

### nv-hint
_routing-hint · chat-test_

_Owner's Claude Desktop test 2026-11-01 (used our tool)_

```
Check PropInspect's guide: how long does a Nevada landlord have to return a deposit?
```

### ca-cap
_routing-plain · handwritten_

```
What's the most a landlord in California can charge for a security deposit?
```

### ny-brooklyn
_routing-plain · reddit_

_Paraphrased from r/Renters (NYC, deposit not returned after ~2 months)_

```
We moved out of our Brooklyn apartment at the end of August and the landlord still hasn't returned our security deposit. How long did they have under New York law?
```

### tx-bad-faith
_routing-plain · handwritten_

```
In Texas, what can a tenant recover if the landlord keeps the deposit in bad faith?
```

### fl-notice
_routing-plain · reddit_

_Paraphrased from r/Renters (FL, landlord keeping deposit plus last month)_

```
My Florida landlord says he's keeping my whole deposit. How long did he have to notify me that he was making a claim on it?
```

### va-norfolk
_routing-plain · reddit_

_Paraphrased from r/Renters (Norfolk, VA)_

```
I'm renting in Norfolk, Virginia and moving out soon. How long will my landlord have to return my deposit?
```

### wa-checklist
_routing-plain · reddit_

_Paraphrased from r/Renters (WA move-in inspection report)_

```
I just moved into a rental in Washington state. Does the landlord have to give me a move-in condition checklist before charging a deposit?
```

### mi-address
_routing-plain · reddit_

_Paraphrased from r/Renters (MI questionable deductions)_

```
We moved out of a rental house in Michigan. Do I have to give the landlord my new address to get the deposit back, and by when?
```

### me-propane
_dispute · reddit_

_Paraphrased from r/Renters (Maine deposit issue)_

```
I moved out of a mobile home in Maine on 9/30 after ending my lease early. The landlord kept part of my deposit to refill the propane tank. How long did she have to send the deposit or a statement?
```

### ca-la-paint
_dispute · reddit_

_Paraphrased from r/Renters (Los Angeles, $500 deduction)_

```
We got our $2,195 deposit back in Los Angeles minus $200 for paint touch-ups and $300 for cleaning, even though we left the place in good shape. Can a California landlord charge for paint like that?
```

### tx-austin
_dispute · reddit_

_Paraphrased from r/Renters (Austin, TX)_

```
I moved out of an apartment in Austin. About $350 of my deposit never came back and they never sent an itemized list. What does Texas law say?
```

### il-chicago
_dispute · reddit_

_Paraphrased from r/Renters (Chicago, IL)_

```
Our landlord in Chicago refused to return our security deposit and made up a list of reasons. What are the Illinois rules on deadlines and penalties?
```

### nc-cleaning
_dispute · reddit_

_Paraphrased from r/Renters (NC extra cleaning fee)_

```
In North Carolina we paid the $260 cleaning fee the lease required, and now the apartment wants to take an extra cleaning charge out of our deposit. What does NC law allow them to deduct?
```

### pa-forwarding
_dispute · reddit_

_Paraphrased from r/Renters (Pittsburgh, PA)_

```
My Pittsburgh landlord claims she never got my forwarding address, so she didn't send my deposit. Does the forwarding address matter under Pennsylvania law?
```

### compare-ca-nv-tx
_compare · chat-test_

_Owner's Claude Desktop test 2026-11-01_

```
Compare security deposit rules in California, Nevada and Texas.
```

### compare-co-wi
_compare · handwritten_

```
I own rentals in Colorado and Wisconsin. Which state gives me longer to return a tenant's deposit?
```

### dc-not-covered
_not-covered · chat-test_

_Owner's Claude Desktop test 2026-11-01_

```
What's the security deposit law in Washington DC?
```

### pr-not-covered
_not-covered · handwritten_

```
How long does a landlord in Puerto Rico have to return a security deposit?
```

### off-capital
_off-topic · handwritten_

```
What's the capital of Nevada?
```

### off-drywall
_off-topic · reddit_

_Paraphrased from r/Renters (Los Angeles, puppy chewed wall)_

```
My puppy chewed a small spot on the drywall. What products do I need to patch it before my move-out inspection next week?
```

### off-welcome
_off-topic · handwritten_

```
Write a short, friendly welcome note for a new tenant moving in this weekend.
```
