import { test } from "@siteimprove/alfa-test";

import { Device } from "@siteimprove/alfa-device";
import { h } from "@siteimprove/alfa-dom";

import { Node } from "../src/index.ts";

const device = Device.standard();

test(`.from() exposes implicitly required children of a presentational element
      with an inherited presentational role`, (t) => {
  const ul = (
    <ul role="presentation">
      <li />
    </ul>
  );

  t.deepEqual(Node.from(ul, device).toJSON(), {
    type: "container",
    node: "/ul[1]",
    role: null,
    children: [
      {
        type: "container",
        node: "/ul[1]/li[1]",
        role: null,
        children: [],
      },
    ],
  });
});

test(`.from() doesn't inherit presentational roles into explicitly required
      children of a presentational element`, (t) => {
  const ul = (
    <ul role="presentation">
      <li role="listitem" />
    </ul>
  );

  t.deepEqual(Node.from(ul, device).toJSON(), {
    type: "container",
    node: "/ul[1]",
    role: null,
    children: [
      {
        type: "element",
        node: "/ul[1]/li[1]",
        role: "listitem",
        name: null,
        attributes: [
          { name: "aria-setsize", value: "1" },
          { name: "aria-posinset", value: "1" },
        ],
        children: [],
      },
    ],
  });
});

test(`.from() doesn't inherit presentational roles into children of implicitly
      required children of a presentational element`, (t) => {
  const ul = (
    <ul role="presentation">
      <li>
        {
          // This element should _not_ inherit a presentational role as the
          // parent <li> element has no required children.
        }
        <button />
      </li>
    </ul>
  );

  t.deepEqual(Node.from(ul, device).toJSON(), {
    type: "container",
    node: "/ul[1]",
    role: null,
    children: [
      {
        type: "container",
        node: "/ul[1]/li[1]",
        role: null,
        children: [
          {
            type: "element",
            node: "/ul[1]/li[1]/button[1]",
            role: "button",
            name: null,
            attributes: [],
            children: [],
          },
        ],
      },
    ],
  });
});

test(`.from() doesn't expose children of elements with roles that designate
      their children as presentational`, (t) => {
  const button = (
    <button>
      <img src="#" />
    </button>
  );

  t.deepEqual(Node.from(button, device).toJSON(), {
    type: "element",
    node: "/button[1]",
    role: "button",
    name: null,
    attributes: [],
    children: [
      {
        type: "container",
        node: "/button[1]/img[1]",
        role: null,
        children: [],
      },
    ],
  });
});

test(`.from() maps \`<select>\` to listboxes`, (t) => {
  // mono-line <select> are mapped to combobox by HTML AAM, but their child
  // <option> are still mapped to option, which are out of their context role.
  // We cheat and always map <select> to listbox
  const select = (
    <select>
      <option>Hello</option>
    </select>
  );

  t.deepEqual(Node.from(select, device).toJSON(), {
    type: "element",
    children: [
      {
        type: "element",
        children: [
          {
            type: "text",
            node: "/select[1]/option[1]/text()[1]",
            name: "Hello",
          },
        ],
        node: "/select[1]/option[1]",
        role: "option",
        name: "Hello",
        attributes: [{ name: "aria-selected", value: "false" }],
      },
    ],
    node: "/select[1]",
    role: "listbox",
    name: null,
    attributes: [{ name: "aria-orientation", value: "vertical" }],
  });
});

test(`.from() maps \`<img>\` with no source to presentational role`, (t) => {
  const empty = {
    type: "container",
    node: "/img[1]",
    role: null,
    children: [],
  };

  const images = [<img />, <img src="" />, <img alt="Hello" src="" />];

  for (const img of images) {
    t.deepEqual(Node.from(img, device).toJSON(), empty);
  }
});

test(`.from() maps \`<img>\` with empty \`alt\` and no other naming mechanism to
      presentational role`, (t) => {
  const empty = {
    type: "container",
    node: "/img[1]",
    role: null,
    children: [],
  };

  const images = [<img src="#" alt="" />, <img src="#" alt="" title="" />];

  for (const img of images) {
    t.deepEqual(Node.from(img, device).toJSON(), empty);
  }
});

test(`.from() maps \`<img>\` with empty \`alt\` but a non-empty \`title\` to
      \`img\` role`, (t) => {
  const img = <img src="#" alt="" title="Hello" />;

  t.deepEqual(Node.from(img, device).toJSON(), {
    type: "element",
    node: "/img[1]",
    role: "img",
    name: "Hello",
    attributes: [],
    children: [],
  });
});

test(`.from() maps \`<img>\` with empty \`alt\` but an \`aria-label\` to \`img\`
      role, even when the label is empty`, (t) => {
  for (const [img, name] of [
    [<img src="#" alt="" aria-label="Hello" />, "Hello"],
    [<img src="#" alt="" aria-label="" />, null],
  ] as const) {
    t.deepEqual(Node.from(img, device).toJSON(), {
      type: "element",
      node: "/img[1]",
      role: "img",
      name,
      attributes: [
        { name: "aria-label", value: img.attribute("aria-label").getUnsafe().value },
      ],
      children: [],
    });
  }
});

test(`.from() maps \`<img>\` with empty \`alt\` but an \`aria-labelledby\` to
      \`img\` role, even when the reference dangles`, (t) => {
  const labelled = (
    <div>
      <img src="#" alt="" aria-labelledby="label" />
      <span id="label">Hello</span>
    </div>
  );

  t.deepEqual(
    Node.from(labelled, device).children().first().getUnsafe().toJSON(),
    {
      type: "element",
      node: "/div[1]/img[1]",
      role: "img",
      name: "Hello",
      attributes: [{ name: "aria-labelledby", value: "label" }],
      children: [],
    },
  );

  const dangling = <img src="#" alt="" aria-labelledby="nope" />;

  t.deepEqual(Node.from(dangling, device).toJSON(), {
    type: "element",
    node: "/img[1]",
    role: "img",
    name: null,
    attributes: [{ name: "aria-labelledby", value: "nope" }],
    children: [],
  });
});

test(`.from() correctly handles slotted list items`, (t) => {
  const target = (
    <div>
      {h.shadow([
        <ul>
          <slot></slot>
        </ul>,
      ])}
      <li>Hello</li>
    </div>
  );

  t.deepEqual(
    Node.from(target, device).children().first().getUnsafe().toJSON(),
    {
      type: "element",
      node: "/div[1]/ul[1]",
      role: "list",
      name: null,
      attributes: [],
      children: [
        {
          type: "element",
          node: "/div[1]/ul[1]/li[1]",
          role: "listitem",
          name: null,
          attributes: [
            { name: "aria-setsize", value: "1" },
            { name: "aria-posinset", value: "1" },
          ],
          children: [
            {
              type: "text",
              node: "/div[1]/ul[1]/li[1]/text()[1]",
              name: "Hello",
            },
          ],
        },
      ],
    },
  );
});
