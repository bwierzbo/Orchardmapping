-- The material library predates the pest library and targeted aphids with
-- one generic key. The pest library splits them — rosy apple aphid and
-- woolly apple aphid behave differently enough to warrant separate
-- entries — which left rosy apple aphid with no material against it even
-- though oil and soap are exactly what you reach for.
--
-- Entry keys and target keys have to stay the same vocabulary: that
-- shared key IS the join, so a drift here shows up as an empty
-- "what you have for it" panel rather than an error.

UPDATE spray_materials
SET targets = array_append(targets, 'rosy_apple_aphid'),
    updated_at = NOW()
WHERE material_key IN ('horticultural_oil', 'insecticidal_soap')
  AND 'aphids' = ANY (targets)
  AND NOT ('rosy_apple_aphid' = ANY (targets));
