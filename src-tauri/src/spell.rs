use spellbook::Dictionary;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

pub const LANGUAGES: &[&str] = &["en", "de"];

#[derive(Default)]
pub struct Spell(Mutex<HashMap<String, Arc<Dictionary>>>);

impl Spell {
    fn dictionary(&self, dir: &Path, lang: &str) -> Result<Arc<Dictionary>, String> {
        if !LANGUAGES.contains(&lang) {
            return Err(format!("No dictionary for {lang}"));
        }
        if let Some(d) = self.0.lock().map_err(|e| e.to_string())?.get(lang) {
            return Ok(d.clone());
        }
        let aff = fs::read_to_string(dir.join(format!("{lang}.aff"))).map_err(|e| format!("Dictionary missing: {e}"))?;
        let dic = fs::read_to_string(dir.join(format!("{lang}.dic"))).map_err(|e| format!("Dictionary missing: {e}"))?;
        let dict = Arc::new(Dictionary::new(&aff, &dic).map_err(|e| format!("Invalid dictionary: {e}"))?);
        self.0.lock().map_err(|e| e.to_string())?.insert(lang.into(), dict.clone());
        Ok(dict)
    }

    /// Returns the words that are misspelled.
    pub fn check(&self, dir: &Path, lang: &str, words: Vec<String>) -> Result<Vec<String>, String> {
        let dict = self.dictionary(dir, lang)?;
        Ok(words.into_iter().filter(|w| !dict.check(w)).collect())
    }

    pub fn suggest(&self, dir: &Path, lang: &str, word: &str) -> Result<Vec<String>, String> {
        let dict = self.dictionary(dir, lang)?;
        let mut out = Vec::new();
        dict.suggest(word, &mut out);
        out.truncate(6);
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("dictionaries")
    }

    #[test]
    fn checks_english_and_german() {
        let spell = Spell::default();
        let words = |w: &[&str]| w.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(spell.check(&dir(), "en", words(&["hello", "wrold"])).unwrap(), ["wrold"]);
        assert_eq!(spell.check(&dir(), "de", words(&["Haus", "Grüße", "Hauss"])).unwrap(), ["Hauss"]);
        assert!(spell.suggest(&dir(), "en", "wrold").unwrap().iter().any(|s| s == "world"));
        assert!(spell.check(&dir(), "fr", vec![]).is_err());
    }
}
