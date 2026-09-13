export const ArchitectureDiagram = () => {
  const mono = "'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
  const sans = "'DM Sans', system-ui, sans-serif";
  const black = "#080808";
  const gray = "#666666";
  const orange = "#ff4d00";

  const Box = ({ x, y, w, h, eyebrow, title, children }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#ffffff" stroke={black} strokeWidth="1" />
      <rect x={x + 14} y={y + 15} width="6" height="6" fill={orange} />
      <text x={x + 26} y={y + 21} fontFamily={mono} fontSize="9.5" letterSpacing="0.08em" fill={black}>{eyebrow}</text>
      <text x={x + 14} y={y + 48} fontFamily={sans} fontSize="15" fontWeight="700" letterSpacing="-0.02em" fill={black}>{title}</text>
      {children}
    </g>
  );

  const Label = ({ x, y, anchor = "start", children, fill = gray }) => (
    <text x={x} y={y} fontFamily={mono} fontSize="8.5" letterSpacing="0.08em" fill={fill} textAnchor={anchor}>{children}</text>
  );

  // Pixel robot, 5px cells: '.' empty, 'B' black, 'O' orange.
  const ROBOT = ["....O....", "....B....", ".BBBBBBB.", "BB.....BB", "OB.B.B.BO", "BB.....BB", ".BBBBBBB."];

  return (
    <div className="not-prose my-8 overflow-x-auto">
      <svg
        data-diagram="architecture"
        viewBox="0 0 640 640"
        role="img"
        aria-label="Buyer agent, seller service, Blocky402 facilitator and Hedera testnet, with the HCS registry and receipts topics above"
        style={{ display: "block", width: "100%", height: "auto", minWidth: 560 }}
        shapeRendering="geometricPrecision"
      >
        <defs>
          <pattern id="a402-grid" width="36" height="36" patternUnits="userSpaceOnUse">
            <path d="M36 0H0V36" fill="none" stroke="#e5e5e2" strokeWidth="1" />
          </pattern>
          <marker id="a402-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0 0L8 4L0 8Z" fill={black} />
          </marker>
          <marker id="a402-arrow-orange" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M0 0L8 4L0 8Z" fill={orange} />
          </marker>
        </defs>

        <rect x="0.5" y="0.5" width="639" height="639" fill="#f8f8f6" stroke={black} strokeWidth="1" />
        <rect x="1" y="1" width="638" height="638" fill="url(#a402-grid)" />

        {/* Scattered accent pixels, away from text. */}
        <rect x="316" y="56" width="8" height="8" fill={black} />
        <rect x="340" y="118" width="8" height="8" fill={orange} />
        <rect x="16" y="300" width="8" height="8" fill={black} />
        <rect x="616" y="376" width="8" height="8" fill={orange} />
        <rect x="300" y="404" width="8" height="8" fill={orange} />

        {/* Row one: the two HCS topics. */}
        <Box x={36} y={40} w={224} h={96} eyebrow="HCS REGISTRY TOPIC" title="Listings and delistings">
          <Label x={50} y={112}>ONE MESSAGE PER LISTING</Label>
        </Box>
        <Box x={380} y={40} w={224} h={96} eyebrow="HCS RECEIPTS TOPIC" title="One receipt per settlement">
          <Label x={394} y={112}>RECOMPUTABLE AGAINST THE CHAIN</Label>
        </Box>

        {/* Row two: the two agents. */}
        <Box x={36} y={224} w={224} h={128} eyebrow="BUYER AGENT" title="Discovers, negotiates, pays">
          <Label x={50} y={292}>@X402/FETCH</Label>
          <Label x={50} y={306}>PER-CALL CAP, SESSION BUDGET</Label>
          <g transform="translate(206 312)">
            {ROBOT.flatMap((row, r) =>
              row.split("").map((ch, c) =>
                ch === "." ? null : <rect key={`${r}-${c}`} x={c * 5} y={r * 5} width="5" height="5" fill={ch === "O" ? orange : black} />,
              ),
            )}
          </g>
        </Box>
        <Box x={380} y={224} w={224} h={128} eyebrow="SELLER SERVICE" title="Prices, signs, serves">
          <text x={394} y={296} fontFamily={mono} fontSize="9.5" fill={black}><tspan fill={orange}>POST</tspan> /a2a/quote</text>
          <text x={394} y={312} fontFamily={mono} fontSize="9.5" fill={black}><tspan fill={orange}>POST</tspan> /v1/infer</text>
          <text x={394} y={328} fontFamily={mono} fontSize="9.5" fill={black}><tspan fill={orange}>GET</tspan> /v1/rates/hbar</text>
        </Box>

        {/* Row three: settlement. */}
        <Box x={36} y={440} w={224} h={96} eyebrow="BLOCKY402 FACILITATOR" title="Verifies, co-signs, settles">
          <Label x={50} y={512}>PAYS THE NETWORK FEE</Label>
        </Box>
        <Box x={380} y={440} w={224} h={96} eyebrow="HEDERA TESTNET" title="Consensus and HTS">
          <Label x={394} y={512}>MIRROR NODE: THE PUBLIC VERIFIER</Label>
          <rect x="562" y="452" width="28" height="28" fill={black} />
          <text x="576" y="471" fontFamily={sans} fontSize="15" fontWeight="700" fill="#ffffff" textAnchor="middle">H</text>
        </Box>

        {/* Buyer and seller: discover, quote, pay. */}
        <line x1="260" y1="258" x2="380" y2="258" stroke={black} strokeWidth="1" strokeDasharray="3 4" markerEnd="url(#a402-arrow)" />
        <Label x={320} y={250} anchor="middle" fill={black}>DISCOVER</Label>
        <line x1="268" y1="296" x2="372" y2="296" stroke={black} strokeWidth="1" strokeDasharray="3 4" markerStart="url(#a402-arrow)" markerEnd="url(#a402-arrow)" />
        <Label x={320} y={288} anchor="middle" fill={black}>QUOTE</Label>
        <line x1="268" y1="334" x2="372" y2="334" stroke={orange} strokeWidth="1" strokeDasharray="3 4" markerStart="url(#a402-arrow-orange)" markerEnd="url(#a402-arrow-orange)" />
        <Label x={320} y={326} anchor="middle" fill={orange}>402 / PAY</Label>

        {/* Buyer reads the registry from the mirror node. */}
        <line x1="110" y1="136" x2="110" y2="224" stroke={black} strokeWidth="1" strokeDasharray="3 4" markerEnd="url(#a402-arrow)" />
        <Label x={120} y={176}>READ VIA</Label>
        <Label x={120} y={188}>MIRROR NODE</Label>

        {/* Seller publishes its listing and its receipts. */}
        <path d="M420 224V190H300V88H260" fill="none" stroke={black} strokeWidth="1" strokeDasharray="3 4" markerEnd="url(#a402-arrow)" />
        <Label x={360} y={182} anchor="middle">PUBLISH LISTING</Label>
        <line x1="560" y1="224" x2="560" y2="136" stroke={black} strokeWidth="1" strokeDasharray="3 4" markerEnd="url(#a402-arrow)" />
        <Label x={552} y={184} anchor="end">PUBLISH RECEIPT</Label>

        {/* Buyer signs, the facilitator settles on Hedera. */}
        <line x1="110" y1="352" x2="110" y2="440" stroke={orange} strokeWidth="1" strokeDasharray="3 4" markerEnd="url(#a402-arrow-orange)" />
        <Label x={120} y={392}>PARTIALLY SIGNED</Label>
        <Label x={120} y={404}>TRANSFERTRANSACTION</Label>
        <line x1="260" y1="488" x2="380" y2="488" stroke={black} strokeWidth="1" strokeDasharray="3 4" markerEnd="url(#a402-arrow)" />
        <Label x={320} y={480} anchor="middle" fill={black}>SUBMIT</Label>

        {/* Corner micro-copy. */}
        <rect x="572" y="566" width="32" height="1" fill={black} />
        <Label x={604} y={584} anchor="end" fill={black}>DISCOVER. NEGOTIATE.</Label>
        <Label x={604} y={596} anchor="end" fill={black}>PAY. PROVE.</Label>
        <Label x={604} y={608} anchor="end" fill={black}>ON HEDERA.</Label>
      </svg>
    </div>
  );
};
