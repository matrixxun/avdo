export const type = 'full';

export const active = true;

export const description = 'removes unused namespaces declaration';

export const params = undefined;

/**
 * Remove unused namespaces declaration.
 *
 * @param {Object} item current iteration item
 * @return {Boolean} if false, item will be filtered out
 *
 * @author Kir Belevich
 */
export function fn(data) {
  var svgElem,
    xmlnsCollection = [];

  /**
   * Remove namespace from collection.
   *
   * @param {String} ns namescape name
   */
  function removeNSfromCollection(ns) {
    var pos = xmlnsCollection.indexOf(ns);

    // if found - remove ns from the namespaces collection
    if (pos > -1) {
      xmlnsCollection.splice(pos, 1);
    }
  }

  /**
   * Bananas!
   *
   * @param {Array} items input items
   *
   * @return {Array} output items
   */
  function monkeys(items) {
    let i = 0;
    const length = items.content.length;

    while (i < length) {
      const item = items.content[i];

      if (item.isElem('svg')) {
        item.eachAttr(function(attr) {
          // collect namespaces
          if (attr.prefix === 'xmlns' && attr.local) {
            xmlnsCollection.push(attr.local);
          }
        });

        // if svg element has ns-attr
        if (xmlnsCollection.length) {
          // save svg element
          svgElem = item;
        }
      } else if (xmlnsCollection.length) {
        // check item for the ns-attrs
        if (item.prefix) {
          removeNSfromCollection(item.prefix);
        }

        // check each attr for the ns-attrs
        item.eachAttr(function(attr) {
          removeNSfromCollection(attr.prefix);
        });
      }

      // if nothing is found - go deeper
      if (xmlnsCollection.length && item.content) {
        monkeys(item);
      }

      i++;
    }

    return items;
  }

  data = monkeys(data);

  // remove svg element ns-attributes if they are not used even once
  if (xmlnsCollection.length) {
    xmlnsCollection.forEach(function(name) {
      svgElem.removeAttr('xmlns:' + name);
    });
  }

  return data;
}
