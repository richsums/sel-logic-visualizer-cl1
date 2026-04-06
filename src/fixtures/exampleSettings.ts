// ─── Example SEL relay settings fixtures ─────────────────────────────────────
// Realistic QuickSet SHO SET output demonstrating Element, Logic, and Global
// setting categories across SEL 3-Series / 4-Series / 7-Series relays.

// ─── SEL-351 Feeder Protection (QuickSet terminal format) ────────────────────
export const EXAMPLE_FEEDER_SETTINGS = `
=== SEL-351 FEEDER PROTECTION RELAY ===
=== SHO SET Output - Feeder 1A ===

; ──────────────────────────────────────
; GLOBAL SETTINGS (SHO SET G)
; ──────────────────────────────────────
RID = Feeder 1A Protection
TID = Station Alpha - Bus 1
CTR = 120
CTRN = 120
PTR = 180.00
NFREQ = 60
DATE_F = MDY
BAUD1 = 9600

; ──────────────────────────────────────
; ELEMENT SETTINGS - Group 1 (SHO SET 1)
; ──────────────────────────────────────
; Phase Overcurrent
E50P = Y
50P1P = 8.00
50P1D = 0.00
50P2P = 15.00
50P2D = 0.05
; Time-Overcurrent
51P1P = 5.00
51P1C = U1
51P1TD = 3.00
51P1RS = N
; Ground Overcurrent
E50G = Y
50G1P = 1.00
50G2P = 3.00
51G1P = 0.50
51G1C = U2
51G1TD = 2.00
; Negative Sequence
50Q1P = 1.50
51Q1P = 0.75
51Q1TD = 2.50
; Undervoltage / Overvoltage
27P1P = 0.80
27P1D = 2.00
59P1P = 1.20
59P1D = 1.00
; Frequency
81D1TP = 57.00
81D1TD = 0.10
81D2TP = 59.50
81D2TD = 30.00

; ──────────────────────────────────────
; LOGIC SETTINGS (SHO SET L)
; ──────────────────────────────────────
; Trip equation
TR = (50P1 + 50P2 + 51P1T + 51G1T + 51Q1T + 27P1 + 59P1 + 81D1T) * !86BF * !BLOCK_TR
; Close equation
CL = 79CL * 52B * !52A * !BLOCK_CL
; Output contacts
OUT101 = TRIP
OUT102 = CL
OUT103 = 51P1T + 51G1T
OUT104 = BFT
; Breaker failure
BFI = TR * 52A
BFT = PCT(BFI, BFTD) * 52A
86BF = SET(BFT, RST_BFI)
RST_BFI = !BFI * !52A
; Block conditions
BLOCK_TR = SV01 + IN104
BLOCK_CL = SV02 + IN104 + 86BF
; Supervisory variables
SV01 = IN103
SV01PU = 0
SV01DO = 0
SV02 = IN103 + !52A
SV02PU = 60
SV02DO = 0
; Reclosing logic
79CL = R_TR * 52A * !79LOCK
79LOCK = IN104 + 86BF
; Display points
DP1 = 51P1T
DP2 = 51G1T
DP3 = 86BF
; LEDs
LED1 = TRIP
LED2 = 52A
LED3 = 86BF
`.trim();

// ─── SEL-751 Feeder (.txt export CSV format) ────────────────────────────────
export const EXAMPLE_CSV_SETTINGS = `
RID,"Feeder 2B Prot"
TID,"Station Beta"
CTR,"200"
PTR,"1.000"
NFREQ,"60"
E50P,"Y"
50P1P,"6.00"
50P2P,"12.00"
51P1P,"4.00"
51P1C,"C1"
51P1TD,"2.50"
E50G,"Y"
50G1P,"0.80"
51G1P,"0.40"
51G1C,"U2"
51G1TD,"3.00"
50Q1P,"1.00"
27P1P,"0.85"
27P1D,"3.00"
59P1P,"1.15"
59P1D,"2.00"
81D1TP,"57.50"
81D1TD,"0.08"
TR,"51P1T+51G1T+67P1T+67G1T+67G2T+50P1*!IN101+27P1+59P1"
CL,"79CL*52B*!52A"
OUT101,"TRIP"
OUT102,"CL"
OUT103,"51P1T+51G1T"
OUT104,"BFT"
BFI,"TR*52A"
BFT,"SET(BFI*52A,!BFI*!52A)"
86BF,"SET(BFT,PB01)"
SV01,"IN103"
SV01PU,"0"
SV01DO,"60"
SV02,"!52A"
SV02PU,"120"
SV02DO,"0"
79CL,"R_TR*52A*!86BF*!IN104"
DP1,"TRIP"
DP2,"52A"
DP3,"86BF"
LED1,"TRIP"
LED2,"52A"
`.trim();

// ─── SEL-387 Transformer Differential ────────────────────────────────────────
export const EXAMPLE_XFMR_SETTINGS = `
=== SEL-387 TRANSFORMER DIFFERENTIAL ===

; GLOBAL
RID = Xfmr T1 Prot
TID = Station Alpha
CTR1 = 400
CTR2 = 200
CTR3 = 100
PTR = 200.00
NFREQ = 60

; ELEMENT - Differential
O87P = 0.30
SLP1 = 25
SLP2 = 50
PCT2 = 15
PCT5 = 35
E50P = Y
50P1P = 10.00
50G1P = 2.00
51P1P = 6.00
51P1C = U3
51P1TD = 5.00
51G1P = 1.00
51G1C = U2
51G1TD = 3.00
59P1P = 1.25
59P1D = 1.50

; LOGIC
TR = 87R + 87U + 50P1 + 51P1T + 51G1T + 59P1
OUT101 = TRIP
OUT102 = 87R + 87U
OUT103 = 51P1T
86 = SET(TR, PB01)
ALARM = 51P1 + 51G1 + 59P1
SV01 = TR
SV01PU = 0
SV01DO = 300
LED1 = TRIP
LED2 = 87R
LED3 = 87U
LED4 = 86
`.trim();
