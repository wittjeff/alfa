/// <reference lib="dom" preserve="true" />

/**
 * The function defined in this file is destined to be injected into a browser
 * page, either through a web extension or browser automation tool.
 *
 * As such, it must be serializable, meaning it must not reference any external
 * file (only import type are allowed), and may not use annex functions (who
 * must instead be inlined in the main function).
 *
 * We could use Webpack or the like to bundle the current file with its
 * dependencies into a single file. This is however somewhat heavy-handed, and
 * the rest of Alfa has no need for such complex machinery, so we stick to a
 * simple solution for now.
 */

import type { Rectangle } from "@siteimprove/alfa-rectangle";
import type {
  Attribute,
  Comment,
  Document,
  Element,
  Node,
  Rule,
  Shadow,
  Sheet,
  Text,
  Type,
} from "./index.ts";

/**
 * The type of logs.
 *
 * @remarks
 * Each log entry **should** be a JSON stringified object of type
 * \{ level: "debug" | "info" | "warn" | "error", type: string, message: string \}
 * Different types may add more fields to the object.
 *
 * @privateRemarks
 * Given that everything is inlined in one function, it is easier to have a
 * "global" logs array and add to it from any subfunction, rather than merging
 * logs from these.
 */
type Logs = { logs: Array<string> };

/**
 * @internal
 */
export namespace Native {
  export async function fromNode(
    node: globalThis.Element,
    options?: Options,
  ): Promise<Element.JSON & Logs>;

  export async function fromNode(
    node: globalThis.Attr,
    options?: Options,
  ): Promise<Attribute.JSON & Logs>;

  export async function fromNode(
    node: globalThis.Text,
    options?: Options,
  ): Promise<Text.JSON & Logs>;

  export async function fromNode(
    node: globalThis.Comment,
    options?: Options,
  ): Promise<Comment.JSON & Logs>;

  export async function fromNode(
    node?: globalThis.Document,
    options?: Options,
  ): Promise<Document.JSON & Logs>;

  export async function fromNode(
    node: globalThis.DocumentType,
    options?: Options,
  ): Promise<Type.JSON & Logs>;

  export async function fromNode(
    node: globalThis.Node,
    options?: Options,
  ): Promise<Node.JSON & Logs>;

  export async function fromNode(
    node: globalThis.Node = globalThis.window.document,
    options?: Options,
  ): Promise<Node.JSON & Logs> {
    const logs: Array<string> = [];

    const {
      withCrossOrigin = false,
      enforceAnonymousCrossOrigin = withCrossOrigin,
      injectDataAlfaId = false,
    } = options ?? {};
    const range = globalThis.document.createRange(); // Used by toText - the same instance can be reused for each text node.

    // The number of CSS rules that were skipped, per rule type. These are
    // logged once per type rather than once per rule, as some pages contain
    // thousands of them.
    const skippedRules = new Map<string, number>();

    const json = await toNode(node);

    for (const [ruleType, count] of skippedRules) {
      logs.push(
        JSON.stringify({
          level: "warn",
          type: "rule",
          message: `Skipped ${count} CSS rule${count === 1 ? "" : "s"} of unsupported type ${ruleType}`,
          ruleType,
          count,
        }),
      );
    }

    return { ...json, logs };

    async function toNode(node: globalThis.Node): Promise<Node.JSON> {
      switch (node.nodeType) {
        case node.ELEMENT_NODE:
          return toElement(node as globalThis.Element);

        case node.ATTRIBUTE_NODE:
          return toAttribute(node as globalThis.Attr);

        case node.TEXT_NODE:
          return toText(node as globalThis.Text);

        case node.COMMENT_NODE:
          return toComment(node as globalThis.Comment);

        case node.DOCUMENT_NODE:
          return toDocument(node as globalThis.Document);

        case node.DOCUMENT_TYPE_NODE:
          return toType(node as globalThis.DocumentType);
      }

      throw new Error(`Unsupported node of type: ${node.nodeType}`);
    }

    async function toElement(
      element:
        | globalThis.Element
        | globalThis.HTMLElement
        | globalThis.HTMLIFrameElement
        | globalThis.SVGElement,
    ): Promise<Element.JSON> {
      const result: Element.JSON = {
        type: "element",
        namespace: element.namespaceURI,
        prefix: element.prefix,
        name: element.localName,
        attributes: map(element.attributes, toAttribute),
        style: "style" in element ? toBlock(element.style) : null,
        children: await mapAsync(element.childNodes, toNode),
        shadow:
          element.shadowRoot !== null
            ? await toShadow(element.shadowRoot)
            : null,
        content:
          "contentDocument" in element && element.contentDocument !== null
            ? await toDocument(element.contentDocument)
            : null,
        box: toRectangle(element.getBoundingClientRect()),
      };

      if (injectDataAlfaId) {
        const internalId = globalThis.crypto.randomUUID();

        // Add the internal ID to the result.
        result.internalId = internalId;
        // Add the data-alfa-id attribute to the result.
        result.attributes.push({
          type: "attribute",
          namespace: null,
          prefix: null,
          name: "data-alfa-id",
          value: internalId,
        });
        // Add the data-alfa-id attribute to the element in the page.
        element.setAttribute("data-alfa-id", internalId);
      }

      return result;
    }

    function toAttribute(attribute: globalThis.Attr): Attribute.JSON {
      return {
        type: "attribute",
        namespace: attribute.namespaceURI,
        prefix: attribute.prefix,
        name: attribute.localName,
        value: attribute.value,
      };
    }

    function toText(text: globalThis.Text): Text.JSON {
      range.selectNode(text);
      return {
        type: "text",
        data: text.data,
        box:
          // Not all execution environments have layout, e.g. JSDOM:
          // https://github.com/jsdom/jsdom/pull/2719#issuecomment-590145974
          range.getBoundingClientRect !== undefined
            ? toRectangle(range.getBoundingClientRect())
            : null,
      };
    }

    function toComment(comment: globalThis.Comment): Comment.JSON {
      return {
        type: "comment",
        data: comment.data,
      };
    }

    async function toDocument(
      document: globalThis.Document,
    ): Promise<Document.JSON> {
      if (enforceAnonymousCrossOrigin) {
        await ensureCrossOrigin(document);
      }

      return {
        type: "document",
        children: await mapAsync(document.childNodes, toNode),
        style: getStyleSheets(document),
      };
    }

    function toType(type: globalThis.DocumentType): Type.JSON {
      return {
        type: "type",
        name: type.name,
        publicId: type.publicId === "" ? null : type.publicId,
        systemId: type.systemId === "" ? null : type.systemId,
      };
    }

    async function toShadow(
      shadow: globalThis.ShadowRoot,
    ): Promise<Shadow.JSON> {
      if (enforceAnonymousCrossOrigin) {
        await ensureCrossOrigin(document);
      }

      return {
        type: "shadow",
        mode: shadow.mode,
        children: await mapAsync(shadow.childNodes, toNode),
        style: getStyleSheets(shadow),
      };
    }

    /**
     * @privateRemarks
     * Adopted stylesheets are assumed to be ordered after document stylesheets.
     *
     * {@link https://developer.mozilla.org/en-US/docs/Web/API/Document/adoptedStyleSheets}
     */
    function getStyleSheets(
      docOrShadow: globalThis.Document | globalThis.ShadowRoot,
    ): Array<Sheet.JSON> {
      return [
        ...map(docOrShadow.styleSheets, toSheet),
        // `adoptedStyleSheets` generated by JSDOM can be undefined despite it violating the type.
        // It seems this part of the specification is still not fully implemented in JSDOM as of July 2024.
        // https://github.com/jsdom/jsdom/issues/3444
        ...map(docOrShadow.adoptedStyleSheets ?? [], toSheet),
      ];
    }

    function toSheet(sheet: globalThis.CSSStyleSheet): Sheet.JSON {
      let rules: Array<Rule.JSON>;

      try {
        // Reading the rules of a cross-origin style sheet that was not fetched
        // with CORS throws a SecurityError.
        rules = toRules(sheet.cssRules);
      } catch (e) {
        logs.push(
          JSON.stringify({
            level: "error",
            type: "sheet",
            message: `Failed to read CSS rules of style sheet at ${sheet.href}`,
            originalError: `${e}`,
          }),
        );

        rules = [];
      }

      return {
        rules,
        disabled: sheet.disabled,
        condition:
          // Sheets generated by pre-renderers like JSDOM do not contain media
          // at all.
          // OTOH, the MediaList.mediaText interface treat null as the empty
          // string, so we must do the same here (in the other direction).
          (sheet?.media?.mediaText ?? "") === "" ? null : sheet.media.mediaText,
      };
    }

    /**
     * Serialises the rules that can be, and skips the others.
     *
     * @privateRemarks
     * A rule that cannot be serialised must not prevent serialising its
     * siblings: a single `@container` or `@property` rule would otherwise make
     * its whole style sheet (or `@media`, `@supports`, `@layer` block) appear
     * empty, and the page be audited without these styles.
     *
     * {@link https://github.com/Siteimprove/alfa/issues/2188}
     *
     * Rules nested in a style rule are flattened: they are serialised after
     * their parent rule, in order, with the nesting selector resolved. This is
     * where the CSS Nesting specification places them in the cascade.
     *
     * {@link https://drafts.csswg.org/css-nesting-1/#nesting}
     *
     * @param parent - The selector of the style rule in which the rules are
     * nested, if any.
     */
    function toRules(
      rules: globalThis.CSSRuleList,
      parent: string | null = null,
    ): Array<Rule.JSON> {
      const result: Array<Rule.JSON> = [];

      for (let i = 0; i < rules.length; i++) {
        let json: Rule.JSON | null;

        try {
          json = toRule(rules[i], parent);
        } catch (e) {
          logs.push(
            JSON.stringify({
              level: "error",
              type: "rule",
              message: "Failed to serialise a CSS rule",
              originalError: `${e}`,
            }),
          );

          json = null;
        }

        if (json !== null) {
          result.push(json);

          // Not all execution environments support nesting, in which case
          // style rules have no child rules.
          const nested = (rules[i] as Partial<globalThis.CSSStyleRule>)
            .cssRules;

          if (json.type === "style" && nested !== undefined) {
            result.push(...toRules(nested, (json as Rule.Style.JSON).selector));
          }
        }
      }

      return result;
    }

    /**
     * Serialises a rule, or returns `null` if its type is not supported.
     */
    function toRule(
      rule: globalThis.CSSRule,
      parent: string | null,
    ): Rule.JSON | null {
      // In the best case, rule.constructor.name works and everything is fine.
      switch (rule.constructor.name) {
        case "CSSFontFaceRule":
          return toFontFaceRule(rule as globalThis.CSSFontFaceRule);

        case "CSSImportRule":
          return toImportRule(rule as globalThis.CSSImportRule);

        case "CSSKeyframeRule":
          return toKeyframeRule(rule as globalThis.CSSKeyframeRule);

        case "CSSKeyframesRule":
          return toKeyframesRule(rule as globalThis.CSSKeyframesRule);

        case "CSSLayerBlockRule":
          return toLayerBlockRule(rule as globalThis.CSSLayerBlockRule, parent);

        case "CSSLayerStatementRule":
          return toLayerStatementRule(rule as globalThis.CSSLayerStatementRule);

        case "CSSMediaRule":
          return toMediaRule(rule as globalThis.CSSMediaRule, parent);

        case "CSSNamespaceRule":
          return toNamespaceRule(rule as globalThis.CSSNamespaceRule);

        case "CSSNestedDeclarations":
          // Nested declarations only make sense inside a style rule.
          if (parent !== null) {
            return toNestedDeclarations(
              rule as globalThis.CSSNestedDeclarations,
              parent,
            );
          }
          break;

        case "CSSPageRule":
          return toPageRule(rule as globalThis.CSSPageRule);

        case "CSSStyleRule":
          return toStyleRule(rule as globalThis.CSSStyleRule, parent);

        case "CSSSupportsRule":
          return toSupportsRule(rule as globalThis.CSSSupportsRule, parent);
      }

      // In some case (June 2024: in Firefox), rule.constructor.name returns
      // undefined when used from an extension's content script. This is likely
      // due to the fact that the rule has been created in the "page" world,
      // but this code is evaluated in a content script world which does not
      // have access to the actual constructor.
      // However, in that case, .toString() seems to work… Since it may have been
      // redefined along the prototype chain, we make sure to use the basic one.
      // see https://stackoverflow.com/questions/43616128/undefined-javascript-object-constructor
      switch (Object.prototype.toString.apply(rule)) {
        case "[object CSSFontFaceRule]":
          return toFontFaceRule(rule as globalThis.CSSFontFaceRule);
        case "[object CSSImportRule]":
          return toImportRule(rule as globalThis.CSSImportRule);
        case "[object CSSKeyframeRule]":
          return toKeyframeRule(rule as globalThis.CSSKeyframeRule);
        case "[object CSSKeyframesRule]":
          return toKeyframesRule(rule as globalThis.CSSKeyframesRule);
        case "[object CSSLayerBlockRule]":
          return toLayerBlockRule(rule as globalThis.CSSLayerBlockRule, parent);
        case "[object CSSLayerStatementRule]":
          return toLayerStatementRule(rule as globalThis.CSSLayerStatementRule);
        case "[object CSSMediaRule]":
          return toMediaRule(rule as globalThis.CSSMediaRule, parent);
        case "[object CSSNamespaceRule]":
          return toNamespaceRule(rule as globalThis.CSSNamespaceRule);
        case "[object CSSNestedDeclarations]":
          if (parent !== null) {
            return toNestedDeclarations(
              rule as globalThis.CSSNestedDeclarations,
              parent,
            );
          }
          break;
        case "[object CSSPageRule]":
          return toPageRule(rule as globalThis.CSSPageRule);
        case "[object CSSStyleRule]":
          return toStyleRule(rule as globalThis.CSSStyleRule, parent);
        case "[object CSSSupportsRule]":
          return toSupportsRule(rule as globalThis.CSSSupportsRule, parent);
      }

      // If everything else failed, we default to the deprecated `type`.
      // This is clearly bad, notably because @layer rules where introduced
      // after the deprecation and thus do not have a `type` property.
      // But it might still save the show in some corner cases.
      switch (rule.type) {
        case CSSRule.FONT_FACE_RULE:
          return toFontFaceRule(rule as globalThis.CSSFontFaceRule);
        case CSSRule.IMPORT_RULE:
          return toImportRule(rule as globalThis.CSSImportRule);
        case CSSRule.KEYFRAME_RULE:
          return toKeyframeRule(rule as globalThis.CSSKeyframeRule);
        case CSSRule.KEYFRAMES_RULE:
          return toKeyframesRule(rule as globalThis.CSSKeyframesRule);
        // case "CSSLayerBlockRule":
        //   return toLayerBlockRule(rule);
        // case "CSSLayerStatementRule":
        //   return toLayerStatementRule(rule);
        case CSSRule.MEDIA_RULE:
          return toMediaRule(rule as globalThis.CSSMediaRule, parent);
        case CSSRule.NAMESPACE_RULE:
          return toNamespaceRule(rule as globalThis.CSSNamespaceRule);
        case CSSRule.PAGE_RULE:
          return toPageRule(rule as globalThis.CSSPageRule);
        case CSSRule.STYLE_RULE:
          return toStyleRule(rule as globalThis.CSSStyleRule, parent);
        case CSSRule.SUPPORTS_RULE:
          return toSupportsRule(rule as globalThis.CSSSupportsRule, parent);
      }

      // This is a rule of a type that Alfa does not support (e.g., @container,
      // @property, @scope, @starting-style, @counter-style, …). It is skipped,
      // together with the rules it may contain since we cannot tell when these
      // apply, and its siblings are kept.
      const ruleType =
        rule.constructor.name ?? Object.prototype.toString.apply(rule);

      skippedRules.set(ruleType, (skippedRules.get(ruleType) ?? 0) + 1);

      return null;
    }

    function toFontFaceRule(
      rule: globalThis.CSSFontFaceRule,
    ): Rule.FontFace.JSON {
      return {
        type: "font-face",
        style: toBlock(rule.style),
      };
    }

    function toImportRule(rule: globalThis.CSSImportRule): Rule.Import.JSON {
      try {
        // See https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet#instance_properties
        // While the error may theoretically occur on any style sheet, it seems
        // to be mostly present on @import rules due to CORS policy.
        rule.styleSheet?.cssRules;

        return {
          type: "import",
          rules: rule.styleSheet === null ? [] : toSheet(rule.styleSheet).rules,
          condition: rule.media.mediaText === "" ? "all" : rule.media.mediaText,
          href: rule.href,
          supportText: rule.supportsText,
          layer: rule.layerName,
        };
      } catch (e) {
        logs.push(
          JSON.stringify({
            level: "error",
            type: "import",
            message: `Failed to fetch CSS rules for @import rule at ${rule.href}`,
            originalError: `${e}`,
          }),
        );

        return {
          type: "import",
          rules: [],
          condition: rule.media.mediaText === "" ? "all" : rule.media.mediaText,
          href: rule.href,
          supportText: rule.supportsText,
          layer: rule.layerName,
        };
      }
    }

    function toKeyframeRule(
      rule: globalThis.CSSKeyframeRule,
    ): Rule.Keyframe.JSON {
      return {
        type: "keyframe",
        key: rule.keyText,
        style: toBlock(rule.style),
      };
    }

    function toKeyframesRule(
      rule: globalThis.CSSKeyframesRule,
    ): Rule.Keyframes.JSON {
      let rules: Array<Rule.JSON>;

      try {
        rules = toRules(rule.cssRules);
      } catch {
        rules = [];
      }

      return {
        type: "keyframes",
        rules,
        name: rule.name,
      };
    }

    function toLayerBlockRule(
      rule: globalThis.CSSLayerBlockRule,
      parent: string | null,
    ): Rule.Layer.Block.JSON {
      return {
        type: "layer-block",
        layer: rule.name,
        rules: toRules(rule.cssRules, parent),
      };
    }

    function toLayerStatementRule(
      rule: globalThis.CSSLayerStatementRule,
    ): Rule.Layer.Statement.JSON {
      return {
        type: "layer-statement",
        layers: [...rule.nameList],
      };
    }

    function toMediaRule(
      rule: globalThis.CSSMediaRule,
      parent: string | null,
    ): Rule.Media.JSON {
      let rules: Array<Rule.JSON>;

      try {
        rules = toRules(rule.cssRules, parent);
      } catch {
        rules = [];
      }

      return {
        type: "media",
        condition: rule.conditionText,
        rules,
      };
    }

    function toNamespaceRule(
      rule: globalThis.CSSNamespaceRule,
    ): Rule.Namespace.JSON {
      return {
        type: "namespace",
        namespace: rule.namespaceURI,
        prefix: rule.prefix,
      };
    }

    function toPageRule(rule: globalThis.CSSPageRule): Rule.Page.JSON {
      return {
        type: "page",
        selector: rule.selectorText,
        style: toBlock(rule.style),
      };
    }

    function toStyleRule(
      styleRule: globalThis.CSSStyleRule,
      parent: string | null,
    ): Rule.Style.JSON {
      return {
        type: "style",
        selector:
          parent === null
            ? styleRule.selectorText
            : resolveNesting(styleRule.selectorText, parent),
        style: toBlock(styleRule.style),
      };
    }

    /**
     * Serialises the declarations that follow a nested rule in a style rule.
     *
     * @remarks
     * These match the same elements as the style rule they are in, with the
     * same specificity, but are placed after the nested rules that precede
     * them in the cascade.
     *
     * {@link https://drafts.csswg.org/css-nesting-1/#nested-declarations-rule}
     */
    function toNestedDeclarations(
      rule: globalThis.CSSNestedDeclarations,
      parent: string,
    ): Rule.Style.JSON {
      return {
        type: "style",
        selector: parent,
        style: toBlock(rule.style),
      };
    }

    /**
     * Resolves the selector of a nested style rule against the selector of its
     * parent rule, giving a selector that needs no nesting.
     *
     * @remarks
     * The nesting selector `&` represents the elements matched by the parent
     * rule, with the specificity of the most specific selector in the parent's
     * selector list. This is exactly `:is(<parent selector>)`, by which it is
     * replaced. A complex selector without nesting selector is relative to the
     * parent, e.g. `.foo` is `& .foo` and `> .foo` is `& > .foo`.
     *
     * {@link https://drafts.csswg.org/css-nesting-1/#nest-selector}
     *
     * @privateRemarks
     * This works on the text of the selector, without parsing it, because the
     * present function cannot depend on Alfa's selector parser. Browsers
     * serialise attribute values as strings, so `&` is only looked for outside
     * of strings and of attribute selectors.
     */
    function resolveNesting(selector: string, parent: string): string {
      const replacement = `:is(${parent})`;
      const resolved: Array<string> = [];

      // The complex selector currently being read.
      let complex = "";
      let hasNestingSelector = false;
      let parentheses = 0;
      let brackets = 0;
      let i = 0;

      function flush(): void {
        const trimmed = complex.trim();

        resolved.push(
          hasNestingSelector ? trimmed : `${replacement} ${trimmed}`,
        );

        complex = "";
        hasNestingSelector = false;
      }

      while (i < selector.length) {
        const char = selector[i];

        if (char === "\\") {
          // An escaped character, which is copied as is.
          complex += selector.slice(i, i + 2);
          i += 2;
        } else if (char === '"' || char === "'") {
          // A string, which is copied as is.
          let end = i + 1;

          while (end < selector.length && selector[end] !== char) {
            end += selector[end] === "\\" ? 2 : 1;
          }

          complex += selector.slice(i, end + 1);
          i = end + 1;
        } else if (char === "&" && brackets === 0) {
          hasNestingSelector = true;

          // The nesting selector may be written before a type selector
          // (`&div`), which must be first in a compound selector.
          const type =
            /^(?:[a-zA-Z_*\u0080-\uFFFF]|\\.)(?:[\w\u0080-\uFFFF-]|\\.)*/.exec(
              selector.slice(i + 1),
            );

          complex += (type?.[0] ?? "") + replacement;
          i += 1 + (type?.[0].length ?? 0);
        } else if (char === "," && parentheses === 0 && brackets === 0) {
          // The end of a complex selector of the list.
          flush();
          i++;
        } else {
          if (char === "(") {
            parentheses++;
          } else if (char === ")") {
            parentheses--;
          } else if (char === "[") {
            brackets++;
          } else if (char === "]") {
            brackets--;
          }

          complex += char;
          i++;
        }
      }

      flush();

      return resolved.join(", ");
    }

    function toSupportsRule(
      rule: globalThis.CSSSupportsRule,
      parent: string | null,
    ): Rule.Supports.JSON {
      let rules: Array<Rule.JSON>;

      try {
        rules = toRules(rule.cssRules, parent);
      } catch {
        rules = [];
      }

      return {
        type: "supports",
        condition: rule.conditionText,
        rules,
      };
    }

    /**
     * @privateRemarks
     * User Agents normally expose the pre-parsed declarations.
     * However, there is a corner case of shorthands whose value is a `var()`
     * where several UAs (as of April 2024: at least Chrome and Firefox) list
     * the **longhands** in their CSSStyleDeclaration object (in the enumerable
     * part), but associate no values to them, only to the corresponding
     * shorthand (as expected and declared). This causes attempts to access
     * the apparently declared properties through the `getPropertyValue()`
     * method to return an empty string.
     *
     * {@link https://github.com/Siteimprove/alfa/issues/1563}
     *
     * To circumvent that, we simply return the raw CSS text; and delegate
     * parsing to consumers, aka Block.from.
     *
     * Note that somehow JSDOM behaves differently and correctly associate the
     * value with the shorthand. This means that the local tests using JSDOM
     * are brittle and cannot detect a regression on this issue.
     */
    function toBlock(block: globalThis.CSSStyleDeclarationBase): string {
      return block.cssText;
    }

    function toRectangle(domRect: globalThis.DOMRect): Rectangle.JSON {
      return {
        type: "rectangle",
        x: domRect.x,
        y: domRect.y,
        width: domRect.width,
        height: domRect.height,
      };
    }

    function map<T, U>(
      arrayLike: ArrayLike<T>,
      mapper: (value: T) => U,
    ): Array<U> {
      return Array.from(arrayLike, mapper);
    }

    async function mapAsync<T, U>(
      arrayLike: ArrayLike<T>,
      mapper: (value: T) => U | Promise<U>,
    ): Promise<Array<U>> {
      return Promise.all(Array.from(arrayLike, mapper));
    }

    /**
     * Ensure that the needed resources for the document or shadow root, such as
     * style sheets, adhere to CORS policy.
     */
    async function ensureCrossOrigin(
      documentOrShadowRoot: globalThis.Document | globalThis.ShadowRoot,
    ): Promise<void> {
      /**
       * Ensure that all `<link>` elements specify the `crossorigin` attribute.
       * Even `<link>` elements that reference same-origin resources will need
       * this attribute as they may contain nested resource imports that risk
       * violating CORS policy.
       *
       * Do keep in mind that this will only work for resources that also set
       * appropriate CORS request headers.
       */
      const links = documentOrShadowRoot.querySelectorAll("link");
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        /**
         * Skip `<link>` elements for which the `crossorigin` attribute is
         * already set to a valid value.
         */
        if (link.crossOrigin !== null) {
          continue;
        }

        /**
         * Simply setting the `crossorigin` attribute for the `<link>` element
         * will not work as it must be reevaluated. We therefore create a clone,
         * set the `crossorigin` attribute, and replace the original `<link>`
         * element.
         */
        const clone = link.cloneNode() as HTMLLinkElement;

        /**
         * Set the `crossorigin` attribute to `anonymous`, ensuring that
         * credentials are not sent as part of the cross-origin request. This is
         * incredibly important as we don't want to risk leaking credentials!
         */
        clone.crossOrigin = "anonymous";

        /**
         * Replace the original `<link>` element with its clone. For style
         * sheets, this will unfortunately cause a FOUC while the browser
         * recomputes styles.
         *
         * {@link https://en.wikipedia.org/wiki/Flash_of_unstyled_content}
         */
        link.parentNode!.replaceChild(clone, link);

        /**
         * While certain resources will load synchronously from cache, others
         * will not and we therefore need to await these.
         */
        if (shouldAwait(link)) {
          /**
           * Construct a promise that resolves once the `<link>` element either
           * loads successfully or fails to load. If the `<link>` element fails
           * to load, a request error will be logged to the console which
           * should be enough indication that something didn't go quite as
           * expected. Either way, we will deliver audit results even in the
           * event of a missing resource.
           */
          await new Promise<void>((resolve) =>
            ["load", "error"].forEach((event) =>
              clone.addEventListener(event, () => resolve()),
            ),
          );
        }
      }

      /**
       * Check if the given `<link>` element should be awaited.
       */
      function shouldAwait(link: HTMLLinkElement): boolean {
        /**
         * A `<link>` element with an empty `href` will cause the fetch process
         * to abort with no events to await.
         */
        if (link.getAttribute("href")?.trim() === "") {
          return false;
        }

        /**
         * Style sheets should be awaited as these are loaded and applied
         * asynchronously, often times causing additional resources to be loaded
         * via `url()` references and `@import` rules.
         */
        if (link.rel === "stylesheet") {
          return true;
        }

        return false;
      }
    }
  }

  export interface Options {
    /**
     * Deprecated, use enforceAnonymousCrossOrigin instead.
     *
     * @deprecated
     */
    withCrossOrigin?: boolean;

    /**
     * Whether to enforce anonymous crossorigin attribute on <link> missing one.
     *
     * @defaultValue false
     */
    enforceAnonymousCrossOrigin?: boolean;

    /**
     * Whether to inject data-alfa-id attributes on elements of the page.
     *
     * @defaultValue false
     */
    injectDataAlfaId?: boolean;
  }
}
