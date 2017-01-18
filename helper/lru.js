// Based on https://github.com/rsms/js-lru
/**
 * A doubly linked list-based Least Recently Used (LRU) cache. Will keep most
 * recently used items while discarding least recently used items when its limit
 * is reached.
 *
 * Licensed under MIT. Copyright (c) 2010 Rasmus Andersson <http://hunch.se/>
 * See README.md for details.
 *
 * Illustration of the design:
 *
 *       entry             entry             entry             entry
 *       ______            ______            ______            ______
 *      | head |.newer => |      |.newer => |      |.newer => | tail |
 *      |  A   |          |  B   |          |  C   |          |  D   |
 *      |______| <= older.|______| <= older.|______| <= older.|______|
 *
 *  removed  <--  <--  <--  <--  <--  <--  <--  <--  <--  <--  <--  added
 */
class LRUCache {
    constructor (limit) {
        this.size = 0
        this.limit = limit || 10
        this.cache = {}
    }
    add (key, value) {
        const entry = {
            key,
            value
        }
        this.cache[key] = entry
        if (this.tail) {
            this.tail.newer = entry
            entry.older = this.tail
        } else {
            this.head = entry
        }
        // add new entry to the end of the linked list -- it's now the freshest entry.
        this.tail = entry

        if (this.size === this.limit) {
            return this.shift()
        } else {
            this.size++
        }
    }
    /**
     * Purge the least recently used (oldest) entry from the cache. Returns the
     * removed entry or undefined if the cache was empty.
     */
    shift () {
        const entry = this.head
        if (entry) {
            if (entry.newer) {
                this.head = entry.newer
                this.head.older = null
            } else {
                this.head = null
            }
            // Remove last strong reference to <entry> and remove links from the purged
            // entry being returned:
            entry.newer = entry.older = null
            // delete is slow, but we need to do this to avoid uncontrollable growth:
            delete this.cache[entry.key]
        }
        return entry
    }
    /**
     * Get and register recent use of <key>. Returns the value associated with <key>
     * or undefined if not in cache.
     */
    get (key, returnEntry) {
        const entry = this.cache[key]
        if (!entry) return

        if (entry === this.tail) {
            return returnEntry ? entry : entry.value
        }

        // HEAD--------------TAIL
        //   <.older   .newer>
        //  <--- add direction --
        //   A  B  C  <D>  E

        // extract entry
        if (entry.older) {
            entry.newer.older = entry.older
            entry.older.newer = entry.newer
        } else {
            entry.newer.older = null
            this.head = entry.newer
        }
        // set entry to tail
        this.tail.newer = entry
        entry.older = this.tail
        entry.newer = null
        this.tail = entry
        return returnEntry ? entry : entry.value
    }
    /**
     * Update the value of entry with <key>. Returns the old value, or undefined if
     * entry was not in the cache.
     */
    set (key, value) {
        const entry = this.cache[key]
        let oldValue
        if (entry) {
            oldValue = entry.value
            entry.value = value
        } else {
            oldValue = this.add(key, value)
            if (oldValue) oldValue = oldValue.value
        }
        return oldValue
    }
    /**
     * Remove entry <key> from cache and return its value. Returns undefined if not
     * found.
     */
    remove (key) {
        const entry = this.cache[key]
        if (!entry) return

        delete this.cache[key]
        if (entry.older && entry.newer) {
            entry.newer.older = entry.older
            entry.older.newer = entry.newer
        } else if (entry.newer) {
            entry.newer.older = null
            this.head = entry.newer
        } else if (entry.older) {
            entry.older.newer = null
            this.tail = entry.older
        } else {
            this.tail = this.head = null
        }
        entry.older = entry.newer = null
        this.size--
        return entry.value
    }
    clear () {
        this.head = this.tail = null
        this.size = 0
        this.cache = {}
    }
    find (key) {
        return this.cache[key]
    }
    keys () {
        return Object.keys(this.cache)
    }
    toString () {
        let res = ''
        let entry = this.head
        while (entry) {
            res += entry.key + ':' + entry.value
            entry = entry.newer
            if (entry) {
                res += ' < '
            }
        }
        return res
    }
}

module.exports = LRUCache
