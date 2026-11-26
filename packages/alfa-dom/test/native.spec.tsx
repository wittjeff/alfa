import { test } from "@siteimprove/alfa-test";
import { JSDOM } from "jsdom";

import {
  type Document,
  h,
  Node,
  Query,
  type Sheet,
} from "@siteimprove/alfa-dom";
import { Native } from "@siteimprove/alfa-dom/native";

/**
 * Note: This test suite uses JSDOM parser to easily build native documents.
 * We could instead manually build the documents as needed. It would be more
 * complete as it could escape the quirks of JSDOM, but it would be more
 * work to write and maintain.
 *
 * Full integration tests should be written in the browser automation packages
 * of the `alfa-integrations` repository.
 */

/**
 * Note: JSDOM only has partial support for part of CSS, this seems to be
 * due to using an unmaintained library CSSOM 🙈
 * Therefore, it is not possible to test @layer rules and probably some others.
 */

/**
 * Note: all tests loop Native.fromNode through Node.from and .toJSON()
 * This effectively removes the box that is added by Native.fromNode.
 * Since we run in JSDOM, the document is not rendered and the box is always
 * { x:0, y:0, width:0, height:0 }.
 */

/**
 * Note: JSDOM is not currently able to pass constructed stylesheets to a shadow root.
 * See https://github.com/jsdom/jsdom/issues/3645.
 *
 * It does support passing them to the document when script execution is enabled, so there is a test for that.
 */

async function makeJSON(
  html: string,
  options?: Native.Options,
): Promise<Document.JSON> {
  const jsdom = new JSDOM(html);
  globalThis.document = jsdom.window.document;

  return Node.from(await Native.fromNode(document, options)).toJSON();
}

test("Native.fromNode() builds a simple document", async (t) => {
  const actual = await makeJSON("<div id='hello' class='foo'>Hello</div>");

  t.deepEqual(
    actual,
    h
      .document([
        <html>
          <head></head>
          <body>
            <div id="hello" class="foo">
              Hello
            </div>
          </body>
        </html>,
      ])
      .toJSON(),
  );
});

test("Native.fromNode() uses global document if none is provided", async (t) => {
  const html = "<div id='hello' class='foo'>Hello</div>";
  // JSDOM DOMWindow is indeed not really compatible with globalThis.window but
  // for the part we use here, it is sufficient.
  globalThis.window = new JSDOM(html).window as any;
  const actual = Node.from(await Native.fromNode()).toJSON();

  t.deepEqual(
    actual,
    h
      .document([
        <html>
          <head></head>
          <body>
            <div id="hello" class="foo">
              Hello
            </div>
          </body>
        </html>,
      ])
      .toJSON(),
  );
});

test("Native.fromNode() builds a document with element's style", async (t) => {
  const actual = await makeJSON("<div style='color: red'>Hello</div>");

  t.deepEqual(
    actual,
    h
      .document([
        <html>
          <head></head>
          <body>
            <div style={{ color: "red" }}>Hello</div>
          </body>
        </html>,
      ])
      .toJSON(),
  );
});

test("Native.fromNode() builds a document with global style", async (t) => {
  const actual = await makeJSON(
    "<head><style>div {color: red}</style></head><body><div>Hello</div></body>",
  );

  t.deepEqual(
    actual,
    h
      .document(
        [
          <html>
            <head>
              <style>{"div {color: red}"}</style>
            </head>
            <body>
              <div>Hello</div>
            </body>
          </html>,
        ],
        [h.sheet([h.rule.style("div", { color: "red" })])],
      )
      .toJSON(),
  );
});

test("Native.fromNode() does not change <link> by default", async (t) => {
  const actual = await makeJSON(
    "<head><link rel='stylesheet' href='foo.css' /></head><body>Hello</body>",
  );

  t.deepEqual(
    actual,
    h
      .document([
        <html>
          <head>
            <link rel="stylesheet" href="foo.css" />
          </head>
          <body>Hello</body>
        </html>,
      ])
      .toJSON(),
  );
});

test("Native.fromNode() adds crossorigin to <link> without one, when asked", async (t) => {
  // We can hardly test the replacement on a stylesheet link, because
  // Native.fromNode awaits the stylesheet to be loaded, which is not easy
  // in this setup.
  const actual = await makeJSON(
    "<head><link rel='icon' href='foo.png' /><link rel='stylesheet' href='bar.css' crossorigin='use-credentials'/></head><body>Hello</body>",
    { enforceAnonymousCrossOrigin: true },
  );

  t.deepEqual(
    actual,
    h
      .document([
        <html>
          <head>
            <link rel="icon" href="foo.png" crossorigin="anonymous" />
            <link
              rel="stylesheet"
              href="bar.css"
              crossorigin="use-credentials"
            />
          </head>
          <body>Hello</body>
        </html>,
      ])
      .toJSON(),
  );
});

test("Native.fromNode)() adds data-alfa-id if asked to", async (t) => {
  const html = "<div id='hello' class='foo'>Hello</div>";
  const jsdom = new JSDOM(html);
  globalThis.document = jsdom.window.document;

  const alfaNode = Node.from(
    await Native.fromNode(document, {
      injectDataAlfaId: true,
    }),
  );

  const alfaElt = Query.getElementIdMap(alfaNode).get("hello").getUnsafe();
  const alfaId = alfaElt.internalId;
  const alfaIdAttr = alfaElt.attribute("data-alfa-id").getUnsafe().value;

  const jsdomId = jsdom.window.document
    .getElementById("hello")!
    .getAttribute("data-alfa-id");

  t.equal(alfaId, jsdomId);
  t.equal(alfaId, alfaIdAttr);
});

test("Native.fromNode() handles variables in shorthands", async (t) => {
  const actual = await makeJSON(
    "<head><style>div { --red: #FF0000; background: var(--red); }</style></head><body><div>Hello</div></body>",
  );

  t.deepEqual(
    actual,
    h
      .document(
        [
          <html>
            <head>
              <style>{"div { --red: #FF0000; background: var(--red); }"}</style>
            </head>
            <body>
              <div>Hello</div>
            </body>
          </html>,
        ],
        [
          h.sheet([
            h.rule.style("div", {
              "--red": "#FF0000",
              background: "var(--red)",
            }),
          ]),
        ],
      )
      .toJSON(),
  );
});

test("Native.fromNode() handles constructed stylesheets passed to document.adoptedStyleSheets", async (t) => {
  const dom = new JSDOM(
    `
<p>This will be styled using a constructed stylesheet.</p>

<script>
  const sheet = new CSSStyleSheet();
  sheet.insertRule("p { color: green; }");

  document.adoptedStyleSheets = [sheet];
</script>
`,
    { runScripts: "dangerously" }, // This is safe because we control the code in the script above. DO NOT use it with code that is not under our control e.g. passed in through a function parameter.
  );

  const doc = Node.from(await Native.fromNode(dom.window.document));

  t.deepEqual(
    [...doc.style].map((sheet) => sheet.toJSON()),
    [
      h
        .sheet([
          h.rule.style("p", {
            color: "green",
          }),
        ])
        .toJSON(),
    ],
  );
});

async function makeSheets(css: string): Promise<{
  sheets: Array<Sheet.JSON>;
  logs: Array<{ [key: string]: unknown }>;
}> {
  const jsdom = new JSDOM(`<head><style>${css}</style></head>`);
  globalThis.document = jsdom.window.document;
  // Native.fromNode falls back on the constants of the CSSRule interface for
  // rules it does not recognise by name. Browsers always provide it.
  globalThis.CSSRule = jsdom.window.CSSRule;

  const json = await Native.fromNode(document);

  return {
    sheets: [...(Node.from(json) as Document).style].map((sheet) =>
      sheet.toJSON(),
    ),
    logs: json.logs.map((log) => JSON.parse(log)),
  };
}

test("Native.fromNode() skips rules of unsupported types and keeps their siblings", async (t) => {
  const { sheets, logs } = await makeSheets(`
    .before { color: red }
    @container (width > 10px) { .inside { color: blue } }
    @counter-style thumbs { system: cyclic; symbols: "x"; suffix: " " }
    @container (width > 20px) { .inside { color: green } }
    .after { color: red }
  `);

  t.deepEqual(sheets, [
    h
      .sheet([
        h.rule.style(".before", { color: "red" }),
        h.rule.style(".after", { color: "red" }),
      ])
      .toJSON(),
  ]);

  // Skipped rules are logged once per type.
  t.deepEqual(logs, [
    {
      level: "warn",
      type: "rule",
      message: "Skipped 2 CSS rules of unsupported type CSSContainerRule",
      ruleType: "CSSContainerRule",
      count: 2,
    },
    {
      level: "warn",
      type: "rule",
      message: "Skipped 1 CSS rule of unsupported type CSSCounterStyleRule",
      ruleType: "CSSCounterStyleRule",
      count: 1,
    },
  ]);
});

test("Native.fromNode() skips rules of unsupported types inside grouping rules", async (t) => {
  const { sheets } = await makeSheets(`
    @media screen {
      .media { color: red }
      @container (width > 10px) { .inside { color: blue } }
    }
    @supports (display: grid) {
      @container (width > 10px) { .inside { color: blue } }
      .supports { color: red }
    }
    @layer base {
      .layer { color: red }
      @container (width > 10px) { .inside { color: blue } }
    }
    .after { color: red }
  `);

  t.deepEqual(sheets, [
    h
      .sheet([
        h.rule.media("screen", [h.rule.style(".media", { color: "red" })]),
        h.rule.supports("(display: grid)", [
          h.rule.style(".supports", { color: "red" }),
        ]),
        h.rule.layerBlock([h.rule.style(".layer", { color: "red" })], "base"),
        h.rule.style(".after", { color: "red" }),
      ])
      .toJSON(),
  ]);
});

test("Native.fromNode() does not log anything when all rules are supported", async (t) => {
  const { logs } = await makeSheets(`
    .foo { color: red }
    @media screen { .bar { color: red } }
  `);

  t.deepEqual(logs, []);
});

test("Native.fromNode() flattens nested style rules", async (t) => {
  const { sheets, logs } = await makeSheets(`
    .parent {
      color: red;
      .child { color: blue }
      & > .direct { color: green }
      .context & { color: yellow }
      &.compound { color: purple }
      background-color: white;
    }
    .after { color: red }
  `);

  t.deepEqual(sheets, [
    h
      .sheet([
        h.rule.style(".parent", { color: "red" }),
        h.rule.style(":is(.parent) .child", { color: "blue" }),
        h.rule.style(":is(.parent) > .direct", { color: "green" }),
        h.rule.style(".context :is(.parent)", { color: "yellow" }),
        h.rule.style(":is(.parent).compound", { color: "purple" }),
        // Declarations after a nested rule come after it in the cascade.
        h.rule.style(".parent", { "background-color": "white" }),
        h.rule.style(".after", { color: "red" }),
      ])
      .toJSON(),
  ]);

  t.deepEqual(logs, []);
});

test("Native.fromNode() resolves the nesting selector against the whole selector list of the parent", async (t) => {
  const { sheets } = await makeSheets(`
    h1, #title {
      & span, em { color: blue }
      .deep { .deeper { color: green } }
    }
  `);

  t.deepEqual(sheets, [
    h
      .sheet([
        h.rule.style("h1, #title", {}),
        h.rule.style(":is(h1, #title) span, :is(h1, #title) em", {
          color: "blue",
        }),
        h.rule.style(":is(h1, #title) .deep", {}),
        h.rule.style(":is(:is(h1, #title) .deep) .deeper", {
          color: "green",
        }),
      ])
      .toJSON(),
  ]);
});

test("Native.fromNode() only replaces the nesting selector outside of strings and attribute selectors", async (t) => {
  const { sheets } = await makeSheets(`
    .parent {
      [title="a & b, c"] { color: blue }
      :not(&) > .other { color: green }
    }
  `);

  t.deepEqual(sheets, [
    h
      .sheet([
        h.rule.style(".parent", {}),
        h.rule.style(':is(.parent) [title="a & b, c"]', { color: "blue" }),
        h.rule.style(":not(:is(.parent)) > .other", { color: "green" }),
      ])
      .toJSON(),
  ]);
});

test("Native.fromNode() flattens style rules and declarations nested in grouping rules", async (t) => {
  const { sheets } = await makeSheets(`
    .parent {
      @media screen {
        color: red;
        .child { color: blue }
      }
      @supports (display: grid) {
        & .grid { color: green }
      }
    }
  `);

  t.deepEqual(sheets, [
    h
      .sheet([
        h.rule.style(".parent", {}),
        h.rule.media("screen", [
          h.rule.style(".parent", { color: "red" }),
          h.rule.style(":is(.parent) .child", { color: "blue" }),
        ]),
        h.rule.supports("(display: grid)", [
          h.rule.style(":is(.parent) .grid", { color: "green" }),
        ]),
      ])
      .toJSON(),
  ]);
});
