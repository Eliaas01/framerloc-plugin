// -----------------------------------------------------------------------------
// IMPORTS-GLOBAL
// -----------------------------------------------------------------------------
import { framer } from "framer-plugin";
import ISO6391 from 'iso-639-1';
import { useEffect, useState, useRef, useCallback, useLayoutEffect, useMemo } from "react";
import "./App.css";
import "./pages/translation/translation.css";
import { Loader } from "./components/Loader/Loader";
import { ProgressDots } from "./components/ProgressDots/ProgressDots";

/* ---------- État global (lecture/écriture de partout) ---------- */
export let projectIdGlobal: string | null = null;
export let licenseKeyGlobal: string | null = null;

/* ---------- Utilitaire: détruit toutes les clés FramerLoc en un clic ---------- */
async function resetPluginData() {
    try {
        /* Supprimer toutes les clés au niveau du projet -------------------- */
        if (framer.getPluginDataKeys) {
            const keys = await framer.getPluginDataKeys();
            for (const key of keys) {
                await framer.setPluginData(key, null);
            }
        } else {
            const globalKeys = [
                "LICENSE",
                "customLanguages",
                "defaultLanguageIso",
                "framerProjectId",
            ];
            for (const key of globalKeys) {
                await framer.setPluginData(key, null);
            }
        }

        /* Supprimer les traductions sur tous les TextNodes ---------------- */
        if (framer.getNodesWithType) {
            const textNodes = await framer.getNodesWithType("TextNode");
            for (const node of textNodes) {
                const keys = (await node.getPluginDataKeys?.()) ?? [];
                for (const k of keys) {
                    await node.setPluginData(k, null);
                }
            }
        }

        framer.notify("Toutes les données FramerLoc ont été réinitialisées !", {
            variant: "success",
        });
        return true;
    } catch (err) {
        console.error("Erreur lors du reset:", err);
        framer.notify("Échec du reset. Voir la console.", { variant: "error" });
        return false;
    }
}


/* ---------- Taille initiale (avant vérification licence) ---------- */
framer.showUI({
    position: "top left",
    width: 500,
    height: 800,
});

// -----------------------------------------------------------------------------
// RACINE REACT
// -----------------------------------------------------------------------------
export function App() {
    const [currentPage, setCurrentPage] = useState<
        "start" | "license" | "home" | "export" | "newtranslation" | "configuration" | "empty"
    >("start");

    /* ----- Ajuster la taille du panneau quand la page change ------------ */
    useEffect(() => {
        const bigPages = ["home", "export", "newtranslation"];
        if (bigPages.includes(currentPage)) {
            framer.showUI({ position: "top left", width: 800, height: 600 });
        } else {
            framer.showUI({ position: "top left", width: 500, height: 800 });
        }
    }, [currentPage]);

    /* ----- Au montage : décider de la page initiale (vérification licence) ----- */
    useEffect(() => {
        const checkPluginState = async () => {
            const license = await framer.getPluginData("LICENSE");
            let projId = await framer.getPluginData("framerProjectId");

            if (!projId && framer.getProjectInfo) {
                const info = await framer.getProjectInfo();
                if (info && info.id) {
                    projId = info.id;
                    await framer.setPluginData("framerProjectId", projId);
                }
            }

            /* Essayer de valider la paire licence⇄projet sur le backend -------- */
            if (license && projId) {
                try {
                    const response = await fetch(
                        "https://framerloc.vercel.app/api/supabase/license",
                        {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ license }),
                        }
                    );

                    const data = await response.json();

                    if (response.ok && data.exists && data.project_id === projId) {
                        setCurrentPage("home"); // déjà lié
                        return;
                    }
                } catch (error) {
                    console.error(
                        "Erreur lors de la vérification de la liaison:",
                        error
                    );
                }
            }

            // Si on arrive ici, soit pas de license, soit validation échouée
            // On reste sur "start" au lieu d'aller directement à "license"
            setCurrentPage("start");
        };

        checkPluginState();
    }, []);

    /* ----- Rendu de la page choisie ------------------------------------------- */
    if (currentPage === "home") {
        return (
            <div className="page-root-translation">
                <div className="page-content-scroll-translation">
                    <hr
                        style={{
                            width: "100%",
                            border: "none",
                            borderTop: "1px solid #2f2f2f",
                            margin: 0,
                        }}
                    />
                    <NewTranslationPage setCurrentPage={setCurrentPage} />
                </div>
            </div>
        );
    }
    if (currentPage === "export") {
        return (
            <div className="page-root">
                <div className="page-content-scroll">
                    <hr
                        style={{
                            width: "100%",
                            border: "none",
                            borderTop: "1px solid #2f2f2f",
                            margin: 0,
                        }}
                    />
                    <ExportPage />
                </div>
            </div>
        );
    }
    if (currentPage === "newtranslation") {
        return (
            <div className="page-root">
                <div className="page-content-scroll">
                    <hr
                        style={{
                            width: "100%",
                            border: "none",
                            borderTop: "1px solid #2f2f2f",
                            margin: 0,
                        }}
                    />
                    <Translationpage setCurrentPage={setCurrentPage} />
                </div>
            </div>
        );
    }
    return (
        <main>
            {currentPage === "license" && (
                <LicensePage onComplete={() => setCurrentPage("home")} />
            )}
            {currentPage === "start" && (
                <StartPage onStartClick={() => setCurrentPage("license")} />
            )}
        </main>
    );
}


// -----------------------------------------------------------------------------
// START-PAGE
//  - Écran d'accueil montré la toute première fois
//  - Le bouton affiche le loader au début, puis "Start" si la vérification échoue
// -----------------------------------------------------------------------------

function StartPage({ onStartClick }: { onStartClick: () => void }) {
    const [projectId, setProjectId] = useState<string | null>(null);
    const [licenseKey, setLicenseKey] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true); // Commence avec loading à true

    /* ----- Au montage: vérifier licence automatiquement ------------------------- */
    useEffect(() => {
        const checkLicenseAndData = async () => {
            try {
                let id = await framer.getPluginData("framerProjectId");
                if (!id && framer.getProjectInfo) {
                    const info = await framer.getProjectInfo();
                    if (info && info.id) {
                        id = info.id;
                        await framer.setPluginData("framerProjectId", id);
                    }
                }
                const license = await framer.getPluginData("LICENSE");

                setProjectId(id || "null");
                setLicenseKey(license || "null");

                // Vérifier si licence valide existe
                if (license && id) {
                    try {
                        const response = await fetch(
                            "https://framerloc.vercel.app/api/supabase/license",
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ license }),
                            }
                        );

                        const data = await response.json();

                        if (response.ok && data.exists && data.project_id === id) {
                            // Licence valide - rediriger immédiatement
                            // Cette logique sera gérée par le useEffect de App
                            return;
                        }
                    } catch (error) {
                        console.error("Erreur lors de la vérification:", error);
                    }
                }

                // Si on arrive ici, pas de licence valide - arrêter le loading
                setIsLoading(false);
            } catch (error) {
                console.error("Error fetching project ID or license:", error);
                setIsLoading(false);
            }
        };

        checkLicenseAndData();
    }, []);

    /* ----- Rendu ------------------------------------------------------- */
    return (
        <div className="home-container">
            <img src="logo.png" alt="Logo" style={{ width: "65%", height: "auto" }} />
            <h1 className="home-title">FramerLoc</h1>
            <p className="home-p">
                With FramerLoc, translate content effortlessly and connect with users from all over the world, creating a truly multilingual experience for your audience.
            </p>
            <div className="home-buttons">
                <button
                    onClick={onStartClick}
                    className="home-button-primary"
                    disabled={isLoading}
                >
                    {isLoading ? <Loader /> : 'Start'}
                </button>

                <div className="home-documentation-container">
                    <div className="home-documentation-texts">
                        <p className="home-documentation-title">If you need help getting started</p>
                        <p className="home-documentation-text">A complete documentation is available to guide you through the plugin...</p>
                    </div>
                    <div className="icon-documentation-container">
                        <a href="https://framerloc.vercel.app/docs" target="_blank" rel="noopener noreferrer">
                            <svg xmlns="http://www.w3.org/2000/svg" height="24" width="21" viewBox="0 0 448 512" className="icon-documentation">
                                <path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/>
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------
// NEW-TRANSLATION-PAGE - MODIFIÉ AVEC POLLING ET DÉTECTION PAGE ACTIVE
//  - Page avec affichage du nom de la page actuelle et sélecteur de langues
//  - NOUVEAU: Polling toutes les 1.5 secondes pour mettre à jour currentPageName automatiquement
//  - NOUVEAU: Détection et highlight de la WebPageNode active
// -----------------------------------------------------------------------------

function NewTranslationPage({ setCurrentPage }: {
  setCurrentPage: (
    page: "start" | "license" | "home" | "export" | "empty" | "newtranslation"
  ) => void;
}) {
  const [languages, setLanguages] = useState<{ name: string; iso: string }[]>([]);
  const [selectedLanguageIso, setSelectedLanguageIso] = useState<string>("");
  const [defaultLanguageIso, setDefaultLanguageIso] = useState<string>("");
  const [currentPageName, setCurrentPageName] = useState<string>("Home");
  const [allPages, setAllPages] = useState<
    { name: string; id: string; active: boolean; isHome: boolean }[]
  >([]);
  const [searchText, setSearchText] = useState<string>("");
  const [textNodeTexts, setTextNodeTexts] = useState<string[]>([]);
  const [textNodesSearchText, setTextNodesSearchText] = useState<string>("");
  const [viewMode, setViewMode] = useState<"single" | "double">("single");
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [doubleViewExpandedItem, setDoubleViewExpandedItem] = useState<number | null>(null);
  const [textareaValues, setTextareaValues] = useState<{ [key: number]: string }>({});
  
  const [activeTab, setActiveTab] = useState<"Pages" | "CMS">("Pages");
  const [cmsCollections, setCmsCollections] = useState<any[]>([]);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set());
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const [selectedCmsItem, setSelectedCmsItem] = useState<{ 
    collectionId: string; 
    itemId: string; 
    collectionName: string;
    itemSlug: string;
  } | null>(null);
  const [selectedItemFields, setSelectedItemFields] = useState<{
    fieldName: string;
    fieldType: string;
    text: string;
  }[]>([]);
  
  const [isConfigPopupOpen, setIsConfigPopupOpen] = useState<boolean>(false);
  
  const textNodesIntervalRef = useRef<number | null>(null);
  const cmsIntervalRef = useRef<number | null>(null);
  const textContainerRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const textareaRefs = useRef<{ [key: number]: HTMLTextAreaElement | null }>({});
  
  const getPageNameFromPath = (path: string): { pageLabel: string; isHome: boolean } => {
    if (path === "/" || path === "" || !path) {
      return { pageLabel: "Home", isHome: true };
    }
    const name = path.startsWith("/") ? path.substring(1) : path;
    return { pageLabel: `/${name.toLowerCase()}`, isHome: false };
  };

const handleSave = async () => {
  try {
    if (!selectedLanguageIso || selectedLanguageIso === defaultLanguageIso) {
      alert('Please select a target language different from the default language');
      return;
    }

    const pageKey = `${currentPageName.toLowerCase()}_translations`;
    
    const existingDataRaw = await framer.getPluginData(pageKey);
    let existingTranslations: any = { originals: [] };
    
    if (existingDataRaw) {
      try {
        existingTranslations = JSON.parse(existingDataRaw);
        // Assurer que originals existe
        if (!existingTranslations.originals) {
          existingTranslations.originals = [];
        }
      } catch (error) {
        console.warn('Could not parse existing translations, creating new');
      }
    }

    // Construire la liste des originaux (si pas déjà fait)
    if (existingTranslations.originals.length === 0) {
      existingTranslations.originals = textNodeTexts;
    }

    // Construire les traductions (seulement les traductions, pas les originaux)
    const currentTranslations: string[] = [];
    
    textNodeTexts.forEach((text, index) => {
      const translation = textareaValues[index];
      if (translation && translation.trim()) {
        currentTranslations.push(translation.trim());
      } else {
        // Si pas de traduction, utiliser le texte original
        currentTranslations.push(text);
      }
    });
    
    // Sauvegarder seulement les traductions pour cette langue
    existingTranslations[selectedLanguageIso] = currentTranslations.join(';');
    
    const jsonString = JSON.stringify(existingTranslations);
    const sizeInBytes = new Blob([jsonString]).size;
    
    if (sizeInBytes > 2000) {
      alert(`Data too large (${sizeInBytes} bytes). Maximum is 2KB. Please reduce translations.`);
      return;
    }
    
    await framer.setPluginData(pageKey, jsonString);
    
    console.log(`✅ Translations saved for ${currentPageName} in ${selectedLanguageIso}`);
    console.log(`Data size: ${sizeInBytes} bytes (optimized structure)`);
    
  } catch (error) {
    console.error('Error saving translations:', error);
    alert('Failed to save translations. Check console for details.');
  }
};


const loadSavedTranslations = async () => {
  try {
    const pageKey = `${currentPageName.toLowerCase()}_translations`;
    const savedDataRaw = await framer.getPluginData(pageKey);
    
    if (!savedDataRaw || !selectedLanguageIso) return;
    
    const savedData = JSON.parse(savedDataRaw);
    const originals = savedData.originals || [];
    const translations = savedData[selectedLanguageIso];
    
    if (translations && originals.length > 0) {
      const translationArray = translations.split(';');
      const newTextareaValues: { [key: number]: string } = {};
      
      originals.forEach((originalText: string, index: number) => {
        if (translationArray[index]) {
          // Trouver l'index dans textNodeTexts
          const textIndex = textNodeTexts.findIndex(text => text === originalText);
          if (textIndex !== -1) {
            newTextareaValues[textIndex] = translationArray[index];
          }
        }
      });
      
      setTextareaValues(prev => ({ ...prev, ...newTextareaValues }));
      console.log(`✅ Loaded translations for ${currentPageName} in ${selectedLanguageIso}`);
    }
  } catch (error) {
    console.warn('Could not load saved translations:', error);
  }
};


  const handlePageClick = async (pageId: string) => {
    try {
      await framer.setSelection([pageId]);
      
      const pageNode = await framer.getNode(pageId);
      if (pageNode) {
        const children = await pageNode.getChildren();
        if (children && children.length > 0) {
          const mainFrame = children[0];
          await framer.zoomIntoView(mainFrame.id);
        } else {
          await framer.zoomIntoView(pageId);
        }
      }
      
      await fetchAllPagesAndCurrent();
      
    } catch (error) {
      console.error("Erreur lors de la navigation vers la page:", error);
      try {
        await framer.zoomIntoView(pageId);
        await fetchAllPagesAndCurrent();
      } catch (fallbackError) {
        console.error("Erreur fallback:", fallbackError);
      }
    }
  };

  const handleCmsItemClick = (collectionId: string, itemId: string, collectionName: string, itemSlug: string, item: any, textFields: any[]) => {
    console.log(`🎯 Sélection CMS Item: [${collectionName}] ${itemSlug}`);
    
    // Extraire tous les fields texte de cet item
    const itemFields: {
      fieldName: string;
      fieldType: string;
      text: string;
    }[] = [];
    
    textFields.forEach((field) => {
      const fieldValue = item.fieldData[field.id];
      
      if (fieldValue !== undefined && fieldValue !== null) {
        let actualText = '';
        
        // Gérer les différents formats de valeur
        if (fieldValue && typeof fieldValue === 'object' && 'value' in fieldValue) {
          actualText = String(fieldValue.value);
        } else if (typeof fieldValue === 'string') {
          actualText = fieldValue;
        } else {
          actualText = String(fieldValue);
        }
        
        // Si c'est du formattedText, supprimer les balises HTML
        if (field.type === 'formattedText') {
          actualText = stripHtmlTags(actualText);
        }
        
        if (actualText.trim()) {
          itemFields.push({
            fieldName: field.name,
            fieldType: field.type,
            text: actualText
          });
        }
      }
    });
    
    setSelectedCmsItem({ collectionId, itemId, collectionName, itemSlug });
    setSelectedItemFields(itemFields);
    setExpandedItems(new Set());
    setDoubleViewExpandedItem(null);
     };

  // Type guard pour vérifier si une valeur est string ou formattedText
  const isStringFieldValue = (value: any): value is string => {
    return typeof value === 'string';
  };

  // Fonction pour supprimer les balises HTML et ne garder que le texte
  const stripHtmlTags = (html: string): string => {
    return html.replace(/<[^>]*>/g, '');
  };

  // Fonction pour récupérer toutes les collections CMS et leurs items avec les champs texte
  const fetchAllCMSCollectionsAndItems = async () => {
    try {
      
      const collections = await framer.getCollections();
      
      const collectionsWithItems = [];
      
      for (let collectionIndex = 0; collectionIndex < collections.length; collectionIndex++) {
        const collection = collections[collectionIndex];
        
        const fields = await collection.getFields();
        const textFields = fields.filter(field => 
          field.type === 'string' || field.type === 'formattedText'
        );
        
        
        const items = await collection.getItems();
        
        collectionsWithItems.push({
          id: collection.id,
          name: collection.name,
          items: items,
          textFields: textFields
        });
      }
      

      setCmsCollections(collectionsWithItems);
      
    } catch (error) {
      setCmsCollections([]);
    }
  };

  const fetchAllPagesAndCurrent = async () => {
    if (!framer.getCanvasRoot || !framer.getNodesWithType) return;
    
    try {
      const canvasRoot = await framer.getCanvasRoot();
      if (!canvasRoot) return;
      
      const webPageNodes = await framer.getNodesWithType("WebPageNode");
      if (!webPageNodes || webPageNodes.length === 0) return;
      
      const activeCanvasId = canvasRoot.id;
      const pages = webPageNodes
        .filter((node: any) => {
          const path = node.path || "";
          return !path.includes(":slug");
        })
        .map((node: any) => {
          const { pageLabel, isHome } = getPageNameFromPath(node.path || "");
          return {
            id: node.id,
            name: pageLabel,
            active: node.id === activeCanvasId,
            isHome,
          };
        });
      
      setAllPages(pages);
      const found = pages.find((page) => page.active);
      const newPageName = found ? found.name : "Home";
      
      if (newPageName !== currentPageName) {
        if (expandedItems.size > 0) {
          setExpandedItems(new Set());
        }
        if (doubleViewExpandedItem !== null) {
          setDoubleViewExpandedItem(null);
        }
      }
      
      setCurrentPageName(newPageName);
      
      if (found) {
        const activePageNode = await framer.getNode(found.id);
        if (activePageNode) {
          const logTextNodes = async () => {
            try {
              
              const allComponentNodes = await framer.getNodesWithType("ComponentNode");
              
              const componentNodeMap = new Map<string, { node: any; texts: string[] }>();
              
              for (let i = 0; i < allComponentNodes.length; i++) {
                const componentNode = allComponentNodes[i];
                const componentAny = componentNode as any;
                
                try {
                  // Récupérer tous les TextNodes de ce ComponentNode
                  const textNodes = await componentNode.getNodesWithType("TextNode");
                  const texts: string[] = [];
                  
                  for (const textNode of textNodes) {
                    try {
                      const textNodeAny = textNode as any;
                      if (textNodeAny.getText) {
                        const text = await textNodeAny.getText();
                        if (text && text.trim()) {
                          texts.push(text);
                        }
                      }
                    } catch (textError) {
                      // Ignorer les erreurs de texte
                    }
                  }
                  
                  // Stocker dans la map
                  componentNodeMap.set(componentNode.id, { node: componentNode, texts });
                  
                } catch (error) {
                  // Ignorer les erreurs d'exploration
                }
              }
              
              const pageTextNodes = await activePageNode.getNodesWithType("TextNode");
              
              const pageTexts = await Promise.all(
                pageTextNodes.map(async (textNode) => {
                  try {
                    const textNodeAny = textNode as any;
                    const text = await textNodeAny.getText();
                    return text === null ? "" : text;
                  } catch (error) {
                    return "Erreur lors de la lecture du texte";
                  }
                })
              );
              
              // *** ÉTAPE 3: RÉCUPÉRER ET MATCHER LES COMPONENTINSTANCENODE ***
              const componentInstances = await activePageNode.getNodesWithType("ComponentInstanceNode");
              
              let allMatchedTexts: string[] = [];
              let totalMatches = 0;
              
              for (let i = 0; i < componentInstances.length; i++) {
                const componentInstance = componentInstances[i];
                const instanceAny = componentInstance as any;
                

                // Tenter de trouver l'ID du ComponentNode correspondant
                let componentNodeId = null;
                
                // Essayer différentes propriétés possibles
                if (instanceAny.componentId) {
                  componentNodeId = instanceAny.componentId;
                } else if (instanceAny.masterComponentId) {
                  componentNodeId = instanceAny.masterComponentId;
                } else if (instanceAny.sourceComponentId) {
                  componentNodeId = instanceAny.sourceComponentId;
                } else {
                  // Essayer de deviner le componentNodeId en comparant les noms
                  for (const [nodeId, nodeData] of componentNodeMap.entries()) {
                    const nodeAny = nodeData.node as any;
                    if (nodeAny.name && instanceAny.name && nodeAny.name === instanceAny.name) {
                      componentNodeId = nodeId;
                      break;
                    }
                  }
                }
                
                // Si on a trouvé un componentNodeId, chercher le match
                if (componentNodeId && componentNodeMap.has(componentNodeId)) {
                  const matchedComponentNode = componentNodeMap.get(componentNodeId)!;
                  
                  if (matchedComponentNode.texts.length > 0) {
                    // AJOUTER LES TEXTES DU COMPONENTNODE COMME S'ILS VENAIENT DE LA PAGE
                    allMatchedTexts = [...allMatchedTexts, ...matchedComponentNode.texts];
                    totalMatches++;
                  } else {
                  }
                } else {
                }
              }
              
              
              // COMBINER : TextNodes directs de la page + TextNodes des ComponentNode matchés
              const allTexts = [...pageTexts, ...allMatchedTexts];
              const nonEmptyTexts = allTexts.filter(text => text.trim() !== "" && text !== "Erreur lors de la lecture du texte");
              const uniqueTexts = [...new Set(nonEmptyTexts)];
              
              // METTRE À JOUR L'INTERFACE AVEC TOUS LES TEXTES DE CETTE PAGE
              setTextNodeTexts(uniqueTexts);
            } catch (error) {
              setTextNodeTexts([]);
            }
          };
          
          await logTextNodes();
          
          if (textNodesIntervalRef.current) {
            clearInterval(textNodesIntervalRef.current);
          }
          
          textNodesIntervalRef.current = window.setInterval(logTextNodes, 10000);
        }
      }
    } catch (error) {
      // Gérer l'erreur silencieusement
    }
  };

  // Fonction de synchronisation qui bascule TOUJOURS vers la div la plus grande
  const synchronizeHeights = useCallback(() => {
    if (viewMode === "double" && doubleViewExpandedItem !== null) {
      const textContainer = textContainerRefs.current[doubleViewExpandedItem];
      const textarea = textareaRefs.current[doubleViewExpandedItem];
      
      if (textContainer && textarea) {
        const parentContainer = textContainer.closest('.translation-pair.fullscreen');
        if (parentContainer) {
          const parentHeight = parentContainer.clientHeight;
          const targetHeight = Math.floor(parentHeight * 0.5) - 20;
          
          textContainer.style.height = `${targetHeight}px`;
          textContainer.style.maxHeight = `${targetHeight}px`;
          textContainer.style.overflowY = 'auto';
          
          textarea.style.height = `${targetHeight}px`;
          textarea.style.maxHeight = `${targetHeight}px`;
          textarea.style.resize = 'none';
        }
      }
    } else if (viewMode === "single" && expandedItems.size > 0) {
      expandedItems.forEach((index) => {
        const textarea = textareaRefs.current[index];
        const container = textContainerRefs.current[index];
        
        if (container && textarea) {
          textarea.style.height = 'auto';
          textarea.style.minHeight = 'auto';
          container.style.height = 'auto';
          container.style.minHeight = 'auto';
          
          textarea.offsetHeight;
          container.offsetHeight;
          
          const textareaScrollHeight = textarea.scrollHeight;
          const containerScrollHeight = container.scrollHeight;
          
          const finalHeight = Math.max(textareaScrollHeight, containerScrollHeight, 60);
          
          textarea.style.height = `${finalHeight}px`;
          textarea.style.minHeight = `${finalHeight}px`;
          container.style.height = `${finalHeight}px`;
          container.style.minHeight = `${finalHeight}px`;
          
          textarea.style.overflow = 'hidden';
          container.style.overflow = 'auto';
        }
      });
    }
    
    Object.keys(textContainerRefs.current).forEach((key) => {
      const index = parseInt(key);
      const isExpandedInSingle = viewMode === "single" && expandedItems.has(index);
      const isExpandedInDouble = viewMode === "double" && doubleViewExpandedItem === index;
      
      if (!isExpandedInSingle && !isExpandedInDouble) {
        const textContainer = textContainerRefs.current[index];
        const textarea = textareaRefs.current[index];
        
        if (textContainer) {
          textContainer.style.height = '30px';
          textContainer.style.minHeight = '30px';
          textContainer.style.overflow = 'hidden';
        }
        if (textarea) {
          textarea.style.height = '30px';
          textarea.style.minHeight = '30px';
          textarea.style.resize = 'vertical';
        }
      }
    });
  }, [expandedItems, doubleViewExpandedItem, viewMode]);

  // Fonction pour gérer les changements de textarea avec synchronisation forcée
  const handleTextareaChange = useCallback((index: number, value: string) => {
    setTextareaValues(prev => ({ ...prev, [index]: value }));
    
    requestAnimationFrame(() => {
      if (expandedItems.has(index) && viewMode === "single") {
        const textarea = textareaRefs.current[index];
        const container = textContainerRefs.current[index];
        
        if (textarea && container) {
          textarea.style.height = 'auto';
          container.style.height = 'auto';
          textarea.style.minHeight = 'auto';
          container.style.minHeight = 'auto';
          
          textarea.offsetHeight;
          container.offsetHeight;
          
          const textareaHeight = textarea.scrollHeight;
          const containerHeight = container.scrollHeight;
          const maxHeight = Math.max(textareaHeight, containerHeight, 60);
          
          textarea.style.height = `${maxHeight}px`;
          textarea.style.minHeight = `${maxHeight}px`;
          container.style.height = `${maxHeight}px`;
          container.style.minHeight = `${maxHeight}px`;
          
          requestAnimationFrame(() => {
            const newTextareaHeight = textarea.scrollHeight;
            const newContainerHeight = container.scrollHeight;
            const newMaxHeight = Math.max(newTextareaHeight, newContainerHeight, 60);
            
            if (newMaxHeight !== maxHeight) {
              textarea.style.height = `${newMaxHeight}px`;
              container.style.height = `${newMaxHeight}px`;
            }
          });
        }
      }
    });
  }, [expandedItems, viewMode]);

  useEffect(() => {
    const loadData = async () => {
      // Récupérer les langues depuis addedLanguages (même clé que ConfigurationPopup)
        // NOUVEAU CODE - Utiliser la même clé que ConfigurationPopup :
let addedLanguagesRaw = await framer.getPluginData("addedLanguages");
let langs: { name: string; iso: string }[] = [];
if (addedLanguagesRaw) {
  try {
    const addedLanguagesStrings: string[] = JSON.parse(addedLanguagesRaw);
    // Convertir "French (fr)" vers { name: "French", iso: "fr" }
    langs = addedLanguagesStrings.map((langStr: string) => {
      const match = langStr.match(/^(.+) \(([^)]+)\)$/);
      if (match) {
        return { name: match[1], iso: match[2] };
      }
      return { name: langStr, iso: "" };
    });
  } catch {
    langs = [];
  }
}
setLanguages(langs);


        // NOUVEAU CODE - Utiliser la même clé que ConfigurationPopup :
const defaultLangRaw = await framer.getPluginData("defaultLanguage");
let defaultIso = "";
if (defaultLangRaw) {
  // Extraire l'ISO code du format "French (fr)"
  const match = defaultLangRaw.match(/\(([^)]+)\)$/);
  if (match) {
    defaultIso = match[1];
  }
}
setDefaultLanguageIso(defaultIso || "");



      const firstNonDefault = langs.find((l) => l.iso !== defaultIso);
      if (firstNonDefault) setSelectedLanguageIso(firstNonDefault.iso);
      else setSelectedLanguageIso("");
      await fetchAllPagesAndCurrent();
      
      await fetchAllCMSCollectionsAndItems();
      cmsIntervalRef.current = window.setInterval(fetchAllCMSCollectionsAndItems, 5000);
    };
    
    loadData();
    
    const pollInterval = setInterval(async () => {
  await fetchAllPagesAndCurrent();
  
  // MODIFICATION 2: Ajouter la synchronisation des langues
  let addedLanguagesRaw = await framer.getPluginData("addedLanguages");
  let langs: { name: string; iso: string }[] = [];
  if (addedLanguagesRaw) {
    try {
      const addedLanguagesStrings: string[] = JSON.parse(addedLanguagesRaw);
      langs = addedLanguagesStrings.map((langStr: string) => {
        const match = langStr.match(/^(.+) \(([^)]+)\)$/);
        if (match) {
          return { name: match[1], iso: match[2] };
        }
        return { name: langStr, iso: "" };
      });
    } catch {
      langs = [];
    }
  }
  setLanguages(langs);

  const defaultLangRaw = await framer.getPluginData("defaultLanguage");
  let defaultIso = "";
  if (defaultLangRaw) {
    const match = defaultLangRaw.match(/\(([^)]+)\)$/);
    if (match) {
      defaultIso = match[1];
    }
  }
  setDefaultLanguageIso(defaultIso || "");
}, 3000);

    
    return () => {
      clearInterval(pollInterval);
      if (textNodesIntervalRef.current) {
        clearInterval(textNodesIntervalRef.current);
      }
      if (cmsIntervalRef.current) {
        clearInterval(cmsIntervalRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    synchronizeHeights();
  }, [expandedItems, doubleViewExpandedItem, synchronizeHeights, textNodeTexts]);

  useEffect(() => {
    setExpandedItems(new Set());
    setDoubleViewExpandedItem(null);
  }, [currentPageName]);

  const filteredPages = allPages.filter((page) => {
    const normalizedName = page.name.replace(/^\//, "").toLowerCase();
    const normalizedSearch = searchText.trim().replace(/^\//, "").toLowerCase();
    return normalizedName.startsWith(normalizedSearch);
  });

  const currentTexts = activeTab === "Pages" 
    ? textNodeTexts 
    : selectedItemFields.map(field => field.text);
  
  const filteredTextNodes = currentTexts.filter((text) => {
    if (textNodesSearchText.trim() === "") {
      return true;
    }
    return text.toLowerCase().includes(textNodesSearchText.toLowerCase());
  });

useEffect(() => {
  loadSavedTranslations();
}, [currentPageName, selectedLanguageIso, textNodeTexts]); // <- textNodeTexts au lieu de filteredTextNodes

useEffect(() => {
  const displayTranslations = async () => {
    try {
      const pageKey = `${currentPageName.toLowerCase()}_translations`;
      const savedDataRaw = await framer.getPluginData(pageKey);
      
      if (!savedDataRaw) {
        console.log(`📋 [${currentPageName}] Aucune traduction sauvegardée`);
        return;
      }
      
      const savedData = JSON.parse(savedDataRaw);
      const originals = savedData.originals || [];
      
      console.log('═══════════════════════════════════════════════');
      console.log(`📄 PAGE: ${currentPageName.toUpperCase()}`);
      console.log('═══════════════════════════════════════════════');
      
      Object.keys(savedData).forEach(key => {
        if (key === 'originals') return; // Skip originals dans l'affichage
        
        const languageIso = key;
        console.log(`\n🌍 LANGUE: ${languageIso.toUpperCase()}`);
        console.log('───────────────────────────────────────────────');
        
        const translations = savedData[languageIso].split(';');
        
        originals.forEach((original: string, index: number) => {
          const translation = translations[index] || '(non traduit)';
          console.log(`  ${index + 1}. "${original}" → "${translation}"`);
        });
        
        console.log(`\n  Total: ${translations.length} traductions`);
      });
      
      console.log('\n═══════════════════════════════════════════════\n');
      
    } catch (error) {
      console.error('Erreur lors de l\'affichage des traductions:', error);
    }
  };
  
  displayTranslations();
  const interval = setInterval(displayTranslations, 5000);
  
  return () => clearInterval(interval);
}, [currentPageName]);


  useLayoutEffect(() => {
    synchronizeHeights();
  }, [filteredTextNodes, synchronizeHeights]);

  const handleRefresh = () => {
    if (activeTab === "Pages") {
      fetchAllPagesAndCurrent();
    } else {
      fetchAllCMSCollectionsAndItems();
    }
  };

  const toggleExpand = (index: number) => {
    if (viewMode === "single") {
      setExpandedItems(prev => {
        const newSet = new Set(prev);
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
        return newSet;
      });
    } else {
      if (doubleViewExpandedItem === index) {
        setDoubleViewExpandedItem(null);
      } else {
        setDoubleViewExpandedItem(index);
      }
    }
  };

  return (
    <>
      <div className="translation-container">
        <div className="translation-header-container">
          <div className="translation-language-container">
            <div className="translation-pagename-container">
              {(() => {
                if (activeTab === "CMS") {
                  return (
                    <>
                      {/* Icône base de données pour le mode CMS */}
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                        <path d="M 5.833 0 C 8.595 0 10.833 1.119 10.833 2.5 C 10.833 3.881 8.595 5 5.833 5 C 3.072 5 0.833 3.881 0.833 2.5 C 0.833 1.119 3.072 0 5.833 0 Z M 10.833 6 C 10.833 7.381 8.595 8.5 5.833 8.5 C 3.072 8.5 0.833 7.381 0.833 6 C 0.833 5.31 0.833 4 0.833 4 C 0.833 5.381 3.072 6.5 5.833 6.5 C 8.595 6.5 10.833 5.381 10.833 4 C 10.833 4 10.833 5.31 10.833 6 Z M 10.833 9.5 C 10.833 10.881 8.595 12 5.833 12 C 3.072 12 0.833 10.881 0.833 9.5 C 0.833 8.81 0.833 7.5 0.833 7.5 C 0.833 8.881 3.072 10 5.833 10 C 8.595 10 10.833 8.881 10.833 7.5 C 10.833 7.5 10.833 8.81 10.833 9.5 Z" fill="currentColor"></path>
                      </svg>
                      <span>
                        {selectedCmsItem ? selectedCmsItem.collectionName : "Select CMS Item"}
                      </span>
                    </>
                  );
                } else {
                  const currentPageObj = allPages.find((page) => page.name === currentPageName);
                  if (currentPageObj?.isHome) {
                    return (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                          <path
                            d="M 1 6.08 C 1 5.707 1.139 5.347 1.39 5.071 L 4.89 1.221 C 5.485 0.566 6.515 0.566 7.11 1.221 L 10.61 5.071 C 10.861 5.347 11 5.707 11 6.08 L 11 9.5 C 11 10.328 10.328 11 9.5 11 L 8 11 C 7.448 11 7 10.552 7 10 L 7 8.25 C 7 7.836 6.664 7.5 6.25 7.5 L 5.75 7.5 C 5.336 7.5 5 7.836 5 8.25 L 5 10 C 5 10.552 4.552 11 4 11 L 2.5 11 C 1.672 11 1 10.328 1 9.5 Z"
                            fill="currentColor"
                          ></path>
                        </svg>
                        <span>{currentPageName}</span>
                      </>
                    );
                  } else {
                    return (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                          <path
                            d="M 1 2.5 C 1 1.119 2.119 0 3.5 0 L 5 0 C 5.552 0 6 0.448 6 1 L 6 3 C 6 4.105 6.895 5 8 5 L 10 5 C 10.552 5 11 5.448 11 6 L 11 9.5 C 11 10.881 9.881 12 8.5 12 L 3.5 12 C 2.119 12 1 10.881 1 9.5 Z M 7.427 0.427 C 7.269 0.269 7 0.381 7 0.604 L 7 3 C 7 3.552 7.448 4 8 4 L 10.396 4 C 10.619 4 10.731 3.731 10.573 3.573 Z"
                            fill="currentColor"
                          ></path>
                        </svg>
                        <span>{currentPageName}</span>
                      </>
                    );
                  }
                }
              })()}
            </div>
            {activeTab === "CMS" && selectedCmsItem && (
            <svg
                  display="block"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 16 16"
                  height="1.5em"
                  width="1.5em"
                >
                  <polyline points="6,4 10,8 6,12"></polyline>
                </svg>
            )}
            {activeTab === "CMS" && selectedCmsItem && (
              <div className="translation-cms-item">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                  <path d="M 1 2.5 C 1 1.119 2.119 0 3.5 0 L 5 0 C 5.552 0 6 0.448 6 1 L 6 3 C 6 4.105 6.895 5 8 5 L 10 5 C 10.552 5 11 5.448 11 6 L 11 9.5 C 11 10.881 9.881 12 8.5 12 L 3.5 12 C 2.119 12 1 10.881 1 9.5 Z M 7.427 0.427 C 7.269 0.269 7 0.381 7 0.604 L 7 3 C 7 3.552 7.448 4 8 4 L 10.396 4 C 10.619 4 10.731 3.731 10.573 3.573 Z" fill="currentColor"></path>
                </svg>
                <span>/{selectedCmsItem.itemSlug}</span>
              </div>
            )}
            
            <svg
              display="block"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 16 16"
              height="1.5em"
              width="1.5em"
            >
              <polyline points="6,4 10,8 6,12"></polyline>
            </svg>
            <div className="translation-language-container">
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <div 
                  onClick={() => {
                    // NOUVELLE LOGIQUE : Si pas de langues disponibles, ouvrir le popup
                    const availableLanguages = languages.filter(lang => lang.iso !== defaultLanguageIso);
                    if (availableLanguages.length === 0) {
                      setIsConfigPopupOpen(true);
                    } else {
                      setIsSelectOpen(!isSelectOpen);
                    }
                  }}
                  style={{
                    gap: '10px',
                    backgroundColor: '#2B2B2B',
                    height: '30px',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 10px',
                    display: 'flex',
                    color: languages.filter(lang => lang.iso !== defaultLanguageIso).length === 0 ? '#999' : '#fff',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    minWidth: '150px',
                    userSelect: "none",
                  }}
                >
                  {/* NOUVELLE LOGIQUE D'AFFICHAGE */}
                  {(() => {
                    const availableLanguages = languages.filter(lang => lang.iso !== defaultLanguageIso);
                    if (availableLanguages.length === 0) {
                      return "Add a language first...";
                    }
                    const selectedLang = languages.find(lang => lang.iso === selectedLanguageIso);
                    return selectedLang?.name || "Select a language...";
                  })()}
                  
                  <svg 
                    display="block" 
                    fill="none" 
                    stroke="currentColor" 
                    stroke-linecap="round" 
                    stroke-linejoin="round" 
                    stroke-width="2" 
                    viewBox="0 0 16 16" 
                    height="1.5em" 
                    width="1.5em"
                    style={{ 
                      float: 'right',
                      transform: isSelectOpen ? 'rotate(90deg)' : 'rotate(-90deg)',
                    }}
                  >
                    <polyline points="6,4 10,8 6,12"></polyline>
                  </svg>
                </div>

                {/* MODIFIER AUSSI LA DROPDOWN POUR NE S'AFFICHER QUE S'IL Y A DES LANGUES */}
                {isSelectOpen && languages.filter(lang => lang.iso !== defaultLanguageIso).length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#2B2B2B',
                    borderTop: 'none',
                    borderRadius: '8px 8px 8px 8px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    zIndex: 1000
                  }}>
                    {languages
                      .filter(lang => lang.iso !== defaultLanguageIso)
                      .map(lang => (
                        <div
                          key={lang.iso}
                          onClick={() => {
                            setSelectedLanguageIso(lang.iso);
                            setIsSelectOpen(false);
                          }}
                          style={{
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 10px',
                            color: '#fff',
                            cursor: 'pointer',
                            borderBottom: '1px solid #444',
                            backgroundColor: selectedLanguageIso === lang.iso ? '#444' : 'transparent'
                          }}
                          onMouseEnter={(e) => (e.target as HTMLDivElement).style.backgroundColor = '#444'}
                          onMouseLeave={(e) => (e.target as HTMLDivElement).style.backgroundColor = selectedLanguageIso === lang.iso ? '#444' : 'transparent'}
                        >
                          {lang.name.charAt(0).toUpperCase() + lang.name.slice(1)} ({lang.iso})
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
        </div>
        <div className="translation-navbar-container">
          <div className="translation-licence-container">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="#FFF"
              viewBox="0 0 256 256"
            >
              <path d="M216.57,39.43A80,80,0,0,0,83.91,120.78L28.69,176A15.86,15.86,0,0,0,24,187.31V216a16,16,0,0,0,16,16H72a8,8,0,0,0,8-8V208H96a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.56-9.57A79.73,79.73,0,0,0,160,176h.1A80,80,0,0,0,216.57,39.43ZM180,92a16,16,0,1,1,16-16A16,16,0,0,1,180,92Z"></path>
            </svg>
          </div>
          <div 
            className="translation-configuration-container"
            onClick={() => setIsConfigPopupOpen(true)}
            style={{ cursor: 'pointer' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#FFF">
              <path
                fill="currentColor"
                d="M1 5.161a2 2 0 0 1 1.008-1.737l5-2.857a2 2 0 0 1 1.984 0l5 2.857A2 2 0 0 1 15 5.161v5.678a2 2 0 0 1-1.008 1.737l-5 2.857a2 2 0 0 1-1.984 0l-5-2.857A2 2 0 0 1 1 10.839ZM5 8a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z"
              ></path>
            </svg>
          </div>
          <div className="translation-documentation-container">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="17"
              height="17"
              fill="#ffffff"
              viewBox="0 0 256 256"
            >
              <path d="M196,96c0,29.47-24.21,54.05-56,59.06V156a12,12,0,0,1-24,0V144a12,12,0,0,1,12-12c24.26,0,44-16.15,44-36s-19.74-36-44-36S84,76.15,84,96a12,12,0,0,1-24,0c0-33.08,30.5-60,68-60S196,62.92,196,96Zm-68,92a20,20,0,1,0,20,20A20,20,0,0,0,128,188Z"></path>
            </svg>
          </div>
        </div>
      </div>

      {/* Suite du JSX avec la sidebar et le contenu de traduction... */}
      <div className="translation-sidebar-translate-container">
        <div className="translation-sidebar-container">
          <div className="translation-sidebar-searchbar-container">
            <div className="translation-sidebar-searchbar">
              <svg xmlns="http://www.w3.org/2000/svg" width="11.384" height="11.134" fill="#999999">
                <path d="M 5 0 C 7.761 0 10 2.239 10 5 C 10 6.046 9.679 7.017 9.13 7.819 L 11.164 9.854 C 11.457 10.146 11.457 10.621 11.164 10.914 C 10.871 11.207 10.396 11.207 10.104 10.914 L 8.107 8.918 C 7.254 9.595 6.174 10 5 10 C 2.239 10 0 7.761 0 5 C 0 2.239 2.239 0 5 0 Z M 1.5 5 C 1.5 6.933 3.067 8.5 5 8.5 C 6.933 8.5 8.5 6.933 8.5 5 C 8.5 3.067 6.933 1.5 5 1.5 C 3.067 1.5 1.5 3.067 1.5 5 Z"></path>
              </svg>
              <input
                className="translation-sidebar-search-input"
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder={activeTab === "Pages" ? "Search pages..." : "Search items..."}
              />
            </div>
            <hr></hr>
            <div className="translation-sidebar-tabs">
              <div className="translation-tabs-container" style={{
                display: "flex",
                background: "#2b2b2b",
                borderRadius: "8px",
                width: "100%"
              }}>
                <button
                  className={`translation-tab ${activeTab === "Pages" ? "active" : ""}`}
                  onClick={() => setActiveTab("Pages")}
                  style={{
                    flex: "1",
                    background: activeTab === "Pages" ? "#555555" : "transparent",
                    color: activeTab === "Pages" ? "#FFF" : "#999999",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "500",
                    transition: "all 0.2s ease"
                  }}
                >
                  Pages
                </button>
                <button
                  className={`translation-tab ${activeTab === "CMS" ? "active" : ""}`}
                  onClick={() => setActiveTab("CMS")}
                  style={{
                    flex: "1",
                    width: "50%",
                    background: activeTab === "CMS" ? "#555555" : "transparent",
                    color: activeTab === "CMS" ? "#FFF" : "#999999",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "500",
                    transition: "all 0.2s ease"
                  }}
                >
                  CMS
                </button>
              </div>
            </div>
          </div>
          
          <div className="translation-sidebar-pages-list-container">
            {activeTab === "Pages" ? (
              filteredPages.map((p) => (
                <div
                  className="translation-sidebar-page-container"
                  key={p.id}
                  style={{
                    background: p.active ? "#2B2B2B" : "transparent",
                    color: p.active ? "#FFF" : "#999999",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePageClick(p.id)}
                  onMouseEnter={(e) => {
                    if (!p.active) {
                      e.currentTarget.style.backgroundColor = "#1A1A1A";
                      e.currentTarget.style.color = "#CCCCCC";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!p.active) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "#999999";
                    }
                  }}
                >
                  {p.isHome ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                      <path
                        d="M 1 6.08 C 1 5.707 1.139 5.347 1.39 5.071 L 4.89 1.221 C 5.485 0.566 6.515 0.566 7.11 1.221 L 10.61 5.071 C 10.861 5.347 11 5.707 11 6.08 L 11 9.5 C 11 10.328 10.328 11 9.5 11 L 8 11 C 7.448 11 7 10.552 7 10 L 7 8.25 C 7 7.836 6.664 7.5 6.25 7.5 L 5.75 7.5 C 5.336 7.5 5 7.836 5 8.25 L 5 10 C 5 10.552 4.552 11 4 11 L 2.5 11 C 1.672 11 1 10.328 1 9.5 Z"
                        fill="currentColor"
                      ></path>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                      <path
                        d="M 1 2.5 C 1 1.119 2.119 0 3.5 0 L 5 0 C 5.552 0 6 0.448 6 1 L 6 3 C 6 4.105 6.895 5 8 5 L 10 5 C 10.552 5 11 5.448 11 6 L 11 9.5 C 11 10.881 9.881 12 8.5 12 L 3.5 12 C 2.119 12 1 10.881 1 9.5 Z M 7.427 0.427 C 7.269 0.269 7 0.381 7 0.604 L 7 3 C 7 3.552 7.448 4 8 4 L 10.396 4 C 10.619 4 10.731 3.731 10.573 3.573 Z"
                        fill="currentColor"
                      ></path>
                    </svg>
                  )}
                  <div
                    className="translation-sidebar-page-text"
                    style={{
                      color: p.active ? "#FFF" : "#999999",
                    }}
                  >
                    {p.name}
                  </div>
                </div>
              ))
            ) : (
              <div>
                {cmsCollections.length > 0 ? (
                  cmsCollections.map((collection) => (
                    <div key={collection.id} style={{ marginBottom: "8px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          paddingRight: "8px",
                          paddingLeft: "8px",
                          paddingTop: "6px",
                          paddingBottom: "6px",
                          cursor: "pointer",
                          background: "#1A1A1A",
                          borderRadius: "8px",
                          marginBottom: "4px"
                        }}
                        onClick={() => {
                          setExpandedCollections(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(collection.id)) {
                              newSet.delete(collection.id);
                            } else {
                              newSet.add(collection.id);
                            }
                            return newSet;
                          });
                        }}
                      >
                        <svg 
                          width="10" 
                          height="10" 
                          viewBox="0 0 16 16" 
                          fill="none" 
                          stroke="#999999" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth="2"
                          style={{
                            marginRight: "8px",
                            transform: expandedCollections.has(collection.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                            transformOrigin: 'center',
                          }}
                        >
                          <polyline points="6,4 10,8 6,12" />
                        </svg>
                        <span style={{ 
                          color: "#FFF", 
                          fontWeight: "500",
                          flex: 1
                        }}>
                          {collection.name}
                        </span>
                        <span style={{ 
                          color: "#666", 
                          fontSize: "12px", 
                          marginLeft: "8px"
                        }}>
                          {collection.items.length}
                        </span>
                      </div>

                      {expandedCollections.has(collection.id) && (
                        <div>
                          {collection.items.map((item: any) => (
                            <div
                              key={item.id}
                              style={{
                                paddingRight: "8px",
                                paddingLeft: "30px",
                                paddingTop: "6px",
                                paddingBottom: "6px",
                                color: selectedCmsItem?.itemId === item.id ? "#FFF" : "#CCCCCC",
                                cursor: "pointer",
                                borderRadius: "8px",
                                marginBottom: "2px",
                                background: selectedCmsItem?.itemId === item.id ? "#2B2B2B" : "transparent",
                                fontWeight: selectedCmsItem?.itemId === item.id ? "500" : "400"
                              }}
                              onClick={() => handleCmsItemClick(collection.id, item.id, collection.name, item.slug, item, collection.textFields)}
                              onMouseEnter={(e) => {
                                if (selectedCmsItem?.itemId !== item.id) {
                                  e.currentTarget.style.backgroundColor = "#1A1A1A";
                                  e.currentTarget.style.color = "#FFF";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (selectedCmsItem?.itemId !== item.id) {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                  e.currentTarget.style.color = "#CCCCCC";
                                }
                              }}
                            >
                              {item.slug}
                            </div>
                          ))}
                          {collection.items.length === 0 && (
                            <div style={{
                              padding: "6px 12px",
                              color: "#666",
                              fontSize: "12px",
                              fontStyle: "italic"
                            }}>
                              No items
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{
                    padding: "20px",
                    textAlign: "center",
                    color: "#999999",
                    fontSize: "14px"
                  }}>
                    No CMS collections found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="translation-translate-container">
          <div className="translation-translate-options-container">
            <div className="translation-translate-searchbar-refresh-container">
              <div className="translation-translate-searchbar">
                <svg xmlns="http://www.w3.org/2000/svg" width="11.384" height="11.134" fill="#999999">
                  <path d="M 5 0 C 7.761 0 10 2.239 10 5 C 10 6.046 9.679 7.017 9.13 7.819 L 11.164 9.854 C 11.457 10.146 11.457 10.621 11.164 10.914 C 10.871 11.207 10.396 11.207 10.104 10.914 L 8.107 8.918 C 7.254 9.595 6.174 10 5 10 C 2.239 10 0 7.761 0 5 C 0 2.239 2.239 0 5 0 Z M 1.5 5 C 1.5 6.933 3.067 8.5 5 8.5 C 6.933 8.5 8.5 6.933 8.5 5 C 8.5 3.067 6.933 1.5 5 1.5 C 3.067 1.5 1.5 3.067 1.5 5 Z"></path>
                </svg>
                <input
                  className="translation-translate-search-input"
                  type="text"
                  value={textNodesSearchText}
                  onChange={(e) => {
                    setTextNodesSearchText(e.target.value);
                    requestAnimationFrame(() => synchronizeHeights());
                  }}
                  placeholder={activeTab === "Pages" ? "Search texts..." : "Search fields..."}
                />
              </div>
              <div className="translation-translate-refresh">
                <button
                  className="translation-translate-refresh-button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleRefresh}
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="translation-translate-show-views-container">
              <div className="translation-translate-views">
                <div className="translation-translate-double-column">
                  <button 
                    className="translation-translate-double-button"
                    onClick={() => setViewMode("double")}
                    style={{
                      backgroundColor: viewMode === "double" ? "#0099FF" : "#333333",
                      cursor: viewMode === "double" ? "text" : "pointer"
                    }}
                    onMouseEnter={(e) => {
                      if (viewMode === "double") {
                        e.currentTarget.style.backgroundColor = "#0099FF";
                      } else {
                        e.currentTarget.style.backgroundColor = "#282828";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (viewMode === "double") {
                        e.currentTarget.style.backgroundColor = "#0099FF";
                      } else {
                        e.currentTarget.style.backgroundColor = "#333333";
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffffff" viewBox="0 0 256 256">
                      <path d="M200,36H56A20,20,0,0,0,36,56V200a20,20,0,0,0,20,20H200a20,20,0,0,0,20-20V56A20,20,0,0,0,200,36ZM60,60h56V196H60ZM196,196H140V60h56Z"></path>
                    </svg>
                  </button>
                </div>
                <div className="translation-translate-single-column">
                  <button 
                    className="translation-translate-single-button"
                    onClick={() => setViewMode("single")}
                    style={{
                      backgroundColor: viewMode === "single" ? "#0099FF" : "#333333",
                      cursor: viewMode === "single" ? "text" : "pointer"
                    }}
                    onMouseEnter={(e) => {
                      if (viewMode === "single") {
                        e.currentTarget.style.backgroundColor = "#0099FF";
                      } else {
                        e.currentTarget.style.backgroundColor = "#282828";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (viewMode === "single") {
                        e.currentTarget.style.backgroundColor = "#0099FF";
                      } else {
                        e.currentTarget.style.backgroundColor = "#333333";
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffffff" viewBox="0 0 256 256">
                      <path d="M208,28H48A20,20,0,0,0,28,48V208a20,20,0,0,0,20,20H208a20,20,0,0,0,20-20V48A20,20,0,0,0,208,28Zm-4,176H52V52H204Z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className={`translation-translate-texts-container ${viewMode === "double" ? "double-column-view" : "single-column-view"}`}>
            {activeTab === "CMS" && !selectedCmsItem ? (
              <div style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "#666",
                fontSize: "14px"
              }}>
                <div>Select a CMS item from the left sidebar to translate its fields</div>
              </div>
            ) : (
              viewMode === "single" ? (
                filteredTextNodes.map((text, index) => (
                  <div 
                    key={index} 
                    className={`translation-translate-textnode-container single-view ${expandedItems.has(index) ? 'expand-mode' : ''}`}
                  >
                    <div 
                      ref={(el) => textContainerRefs.current[index] = el}
                      className={`translation-translate-textnode-textcontainer ${expandedItems.has(index) ? 'expand-mode' : ''}`}
                    >
                      <span className={`translation-translate-textnode-text ${expandedItems.has(index) ? 'expand-mode' : ''}`}>
                        {activeTab === "CMS" && selectedItemFields[index] ? (
                          <>
                            {text}
                          </>
                        ) : text}
                      </span>
                    </div>
                    <svg display="block" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16" height="1.5em" width="1.5em" className={`translation-translate-textnode-middle-arrow single-view ${expandedItems.has(index) ? 'expand-mode' : ''}`}>
                      <polyline points="6,4 10,8 6,12"></polyline>
                    </svg>
                    <textarea 
                      ref={(el) => textareaRefs.current[index] = el}
                      placeholder="Traduction..." 
                      className={`translation-input-single-view ${expandedItems.has(index) ? 'expand-mode' : ''}`}
                      value={textareaValues[index] || ''}
                      onChange={(e) => handleTextareaChange(index, e.target.value)}
                      spellCheck={false}
                      style={{ 
                        resize: 'none',
                        overflow: 'hidden'
                      }}
                    />
                    <div 
                      className={`translation-translate-expand-arrow ${expandedItems.has(index) ? 'expand-mode' : ''}`}
                      onClick={() => toggleExpand(index)}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                        <polyline 
                          points="6,4 10,8 6,12" 
                          style={{
                            transform: expandedItems.has(index) ? 'rotate(90deg)' : 'rotate(-90deg)',
                            transformOrigin: 'center'
                          }}
                        />
                      </svg>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {doubleViewExpandedItem !== null ? (
                    <div className="expanded-fullscreen-container">
                      <div className="translation-pair expand-mode fullscreen">
                        <div 
                          ref={(el) => textContainerRefs.current[doubleViewExpandedItem] = el}
                          className="original-text-row expand-mode fullscreen"
                        >
                          <span className="original-text expand-mode fullscreen">
                            {activeTab === "CMS" && selectedItemFields[doubleViewExpandedItem] ? (
                              <>
                                <div style={{ 
                                  fontSize: '12px', 
                                  color: '#888', 
                                  marginBottom: '8px',
                                  lineHeight: '1.3'
                                }}>
                                </div>
                                {filteredTextNodes[doubleViewExpandedItem]}
                              </>
                            ) : filteredTextNodes[doubleViewExpandedItem]}
                          </span>
                        </div>
                        <div className="translation-input-row">
                          <textarea 
                            ref={(el) => textareaRefs.current[doubleViewExpandedItem] = el}
                            placeholder="Traduction..." 
                            className="translation-input-double-view expand-mode fullscreen"
                            value={textareaValues[doubleViewExpandedItem] || ''}
                            onChange={(e) => handleTextareaChange(doubleViewExpandedItem, e.target.value)}
                            spellCheck={false}
                          />
                          <div 
                            className="translation-translate-expand-arrow double-view expand-mode"
                            onClick={() => toggleExpand(doubleViewExpandedItem)}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#FFFFFF" viewBox="0 0 256 256"><path d="M156,112a12,12,0,0,1-12,12H80a12,12,0,0,1,0-24h64A12,12,0,0,1,156,112Zm76.49,120.49a12,12,0,0,1-17,0L168,185a92.12,92.12,0,1,1,17-17l47.54,47.53A12,12,0,0,1,232.49,232.49ZM112,180a68,68,0,1,0-68-68A68.08,68.08,0,0,0,112,180Z"></path></svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="double-column-layout">
                      <div className="column-1">
                        {filteredTextNodes
                          .slice(0, Math.ceil(filteredTextNodes.length / 2))
                          .map((text, localIndex) => {
                            const globalIndex = localIndex;
                            return (
                              <div 
                                key={globalIndex} 
                                className="translation-pair"
                              >
                                <div 
                                  ref={(el) => textContainerRefs.current[globalIndex] = el}
                                  className="original-text-row"
                                >
                                  <span className="original-text">
                                    {activeTab === "CMS" && selectedItemFields[globalIndex] ? (
                                      <>
                                        <div style={{ 
                                          fontSize: '9px', 
                                          color: '#666', 
                                          marginBottom: '3px',
                                          lineHeight: '1.1'
                                        }}>
                                        </div>
                                        {text}
                                      </>
                                    ) : text}
                                  </span>
                                </div>
                                <div className="translation-input-row">
                                  <textarea 
                                    ref={(el) => textareaRefs.current[globalIndex] = el}
                                    placeholder="Traduction..." 
                                    className="translation-input-double-view"
                                    style={{
                                      height: '30px',
                                      minHeight: '30px',
                                      maxHeight: '30px',
                                      overflowY: 'hidden',
                                      resize: 'none'
                                    }}
                                    value={textareaValues[globalIndex] || ''}
                                    onChange={(e) => handleTextareaChange(globalIndex, e.target.value)}
                                    spellCheck={false}
                                  />
                                  <div 
                                    className="translation-translate-expand-arrow double-view"
                                    onClick={() => toggleExpand(globalIndex)}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffffffff" viewBox="0 0 256 256"><path d="M156,112a12,12,0,0,1-12,12H124v20a12,12,0,0,1-24,0V124H80a12,12,0,0,1,0-24h20V80a12,12,0,0,1,24,0v20h20A12,12,0,0,1,156,112Zm76.49,120.49a12,12,0,0,1-17,0L168,185a92.12,92.12,0,1,1,17-17l47.54,47.53A12,12,0,0,1,232.49,232.49ZM112,180a68,68,0,1,0-68-68A68.08,68.08,0,0,0,112,180Z"></path></svg>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      
                      <div className="column-2">
                        {filteredTextNodes
                          .slice(Math.ceil(filteredTextNodes.length / 2))
                          .map((text, localIndex) => {
                            const globalIndex = localIndex + Math.ceil(filteredTextNodes.length / 2);
                            return (
                              <div 
                                key={globalIndex} 
                                className="translation-pair"
                              >
                                <div 
                                  ref={(el) => textContainerRefs.current[globalIndex] = el}
                                  className="original-text-row"
                                >
                                  <span className="original-text">
                                    {activeTab === "CMS" && selectedItemFields[globalIndex] ? (
                                      <>
                                        <div style={{ 
                                          fontSize: '9px', 
                                          color: '#666', 
                                          marginBottom: '3px',
                                          lineHeight: '1.1'
                                        }}>
                                        </div>
                                        {text}
                                      </>
                                    ) : text}
                                  </span>
                                </div>
                                <div className="translation-input-row">
                                  <textarea 
                                    ref={(el) => textareaRefs.current[globalIndex] = el}
                                    placeholder="Traduction..." 
                                    className="translation-input-double-view"
                                    style={{
                                      height: '30px',
                                      minHeight: '30px',
                                      maxHeight: '30px',
                                      overflowY: 'hidden',
                                      resize: 'none'
                                    }}
                                    value={textareaValues[globalIndex] || ''}
                                    onChange={(e) => handleTextareaChange(globalIndex, e.target.value)}
                                    spellCheck={false}
                                  />
                                  <div 
                                    className="translation-translate-expand-arrow double-view"
                                    onClick={() => toggleExpand(globalIndex)}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#ffffffff" viewBox="0 0 256 256"><path d="M156,112a12,12,0,0,1-12,12H124v20a12,12,0,0,1-24,0V124H80a12,12,0,0,1,0-24h20V80a12,12,0,0,1,24,0v20h20A12,12,0,0,1,156,112Zm76.49,120.49a12,12,0,0,1-17,0L168,185a92.12,92.12,0,1,1,17-17l47.54,47.53A12,12,0,0,1,232.49,232.49ZM112,180a68,68,0,1,0-68-68A68.08,68.08,0,0,0,112,180Z"></path></svg>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </>
              )
            )}
          </div>
          <div className="translation-translate-export-container" style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '15px',
            paddingRight: '15px'
          }}>
            <button 
              className="translation-save-button"
              style={{
                flex: '1',
                height: '35px',
                backgroundColor: '#0099FF',
                color: '#FFF',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '12px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#0088EE';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0099FF';
              }}
              onClick={handleSave}
            >
              Save
            </button>
            <button 
              className="translation-export-button"
              style={{
                flex: '1',
                height: '35px',
                backgroundColor: '#0099FF',
                color: '#FFF',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '12px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#0088EE';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#0099FF';
              }}
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Popup de configuration */}
    <ConfigurationPopup 
      isOpen={isConfigPopupOpen} 
      onClose={() => setIsConfigPopupOpen(false)} 
    />
    </>
  );
}

function ConfigurationPopup({ isOpen, onClose }: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedLanguageToAdd, setSelectedLanguageToAdd] = useState<string>("");
  const [selectedDefaultLanguage, setSelectedDefaultLanguage] = useState<string>("");
  const [addedLanguages, setAddedLanguages] = useState<string[]>([]);
  const [languageToDelete, setLanguageToDelete] = useState<string | null>(null);
  const [currentDefaultLanguage, setCurrentDefaultLanguage] = useState<string>("");
  const [isSettingDefault, setIsSettingDefault] = useState(false);
  const [setDefaultProgress, setSetDefaultProgress] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(5);

  // NOUVEAUX ÉTATS pour les selects personnalisés
  const [isLanguageToAddOpen, setIsLanguageToAddOpen] = useState(false);
  const [isDefaultLanguageOpen, setIsDefaultLanguageOpen] = useState(false);

  // NOUVEAUX ÉTATS pour la recherche
  const [searchAddLanguage, setSearchAddLanguage] = useState<string>("");
  const [searchDefaultLanguage, setSearchDefaultLanguage] = useState<string>("");

  // Refs pour gérer les timers et les inputs
  const setDefaultIntervalRef = useRef<number | null>(null);
  const setDefaultTimeoutRef = useRef<number | null>(null);
  const secondsIntervalRef = useRef<number | null>(null);
  const addLanguageInputRef = useRef<HTMLInputElement>(null);
  const defaultLanguageInputRef = useRef<HTMLInputElement>(null);

  // NOUVEAUX REFS pour les selects
  const addLanguageSelectRef = useRef<HTMLDivElement>(null);
  const defaultLanguageSelectRef = useRef<HTMLDivElement>(null);

  // Récupération de la liste des langues via la librairie iso-639-1
  const predefinedLanguages = useMemo(() => {
    // Obtenir tous les codes ISO-639-1
    const allCodes = ISO6391.getAllCodes();
    
    // Mapper chaque code vers un objet avec nom et code ISO
    return allCodes.map(code => ({
      name: ISO6391.getName(code),
      iso: code
    })).sort((a, b) => a.name.localeCompare(b.name)); // Trier par ordre alphabétique
  }, []);

  // Filtrer les langues disponibles en excluant celles déjà ajoutées
  const availableLanguages = useMemo(() => {
    return predefinedLanguages.filter(lang => {
      const languageEntry = `${lang.name} (${lang.iso})`;
      return !addedLanguages.includes(languageEntry);
    });
  }, [predefinedLanguages, addedLanguages]);

  // Filtrer les langues disponibles selon la recherche (Add Language)
  const filteredAvailableLanguages = useMemo(() => {
    if (!searchAddLanguage) return availableLanguages;
    return availableLanguages.filter(lang =>
      lang.name.toLowerCase().includes(searchAddLanguage.toLowerCase()) ||
      lang.iso.toLowerCase().includes(searchAddLanguage.toLowerCase())
    );
  }, [availableLanguages, searchAddLanguage]);

  // Filtrer les langues ajoutées selon la recherche (Default Language)
  const filteredAddedLanguages = useMemo(() => {
    const languagesToFilter = addedLanguages.filter(language => language !== currentDefaultLanguage);
    if (!searchDefaultLanguage) return languagesToFilter;
    return languagesToFilter.filter(language =>
      language.toLowerCase().includes(searchDefaultLanguage.toLowerCase())
    );
  }, [addedLanguages, currentDefaultLanguage, searchDefaultLanguage]);

  // Charger les langues ajoutées et la langue par défaut depuis Framer au montage du composant
  useEffect(() => {
    const loadData = async () => {
      try {
        // Charger les langues ajoutées
        const storedLanguages = await framer.getPluginData("addedLanguages");
        if (storedLanguages) {
          const languages = JSON.parse(storedLanguages);
          setAddedLanguages(languages);
        }

        // Charger la langue par défaut
        const defaultLang = await framer.getPluginData("defaultLanguage");
        if (defaultLang) {
          setCurrentDefaultLanguage(defaultLang);
        }
      } catch (error) {
        console.error("Erreur lors du chargement des données:", error);
        setAddedLanguages([]);
        setCurrentDefaultLanguage("");
      }
    };

    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Nettoyer les timers quand le composant se démonte ou le popup se ferme
  useEffect(() => {
    if (!isOpen) {
      clearSetDefaultTimers();
    }
    
    return () => {
      clearSetDefaultTimers();
    };
  }, [isOpen]);

  // NOUVEAU : Gestionnaire pour réinitialiser la suppression et fermer les selects quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Vérifier si le clic est à l'intérieur d'un des selects
      const isInsideAddSelect = addLanguageSelectRef.current?.contains(target);
      const isInsideDefaultSelect = defaultLanguageSelectRef.current?.contains(target);
      
      // Si le clic n'est pas dans un select, fermer tous les selects ouverts
      if (!isInsideAddSelect && !isInsideDefaultSelect) {
        if (isLanguageToAddOpen) {
          setIsLanguageToAddOpen(false);
          setSearchAddLanguage("");
        }
        if (isDefaultLanguageOpen) {
          setIsDefaultLanguageOpen(false);
          setSearchDefaultLanguage("");
        }
      }

      // Si une langue est marquée pour suppression
      if (languageToDelete) {
        // Vérifier si le clic n'est pas sur un bouton de suppression
        const isDeleteButton = target.closest('button[data-delete-button]');
        
        // Si ce n'est pas un bouton de suppression, réinitialiser
        if (!isDeleteButton) {
          setLanguageToDelete(null);
        }
      }
    };

    // Ajouter l'écouteur seulement si le popup est ouvert
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Nettoyer l'écouteur
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, languageToDelete, isLanguageToAddOpen, isDefaultLanguageOpen]);

  // Fonction pour nettoyer les timers
  const clearSetDefaultTimers = () => {
    if (setDefaultIntervalRef.current) {
      clearInterval(setDefaultIntervalRef.current);
      setDefaultIntervalRef.current = null;
    }
    if (setDefaultTimeoutRef.current) {
      clearTimeout(setDefaultTimeoutRef.current);
      setDefaultTimeoutRef.current = null;
    }
    if (secondsIntervalRef.current) {
      clearInterval(secondsIntervalRef.current);
      secondsIntervalRef.current = null;
    }
    setIsSettingDefault(false);
    setSetDefaultProgress(0);
    setRemainingSeconds(5);
  };

  // NOUVELLE fonction pour gérer l'ouverture d'un select
  const handleOpenSelect = (selectType: 'add' | 'default') => {
    // Réinitialiser la croix de suppression si elle est activée
    if (languageToDelete) {
      setLanguageToDelete(null);
    }

    if (selectType === 'add') {
      setIsLanguageToAddOpen(!isLanguageToAddOpen);
      setIsDefaultLanguageOpen(false); // Fermer l'autre select
      if (!isLanguageToAddOpen) {
        setTimeout(() => addLanguageInputRef.current?.focus(), 100);
      } else {
        setSearchAddLanguage("");
      }
    } else {
      setIsDefaultLanguageOpen(!isDefaultLanguageOpen);
      setIsLanguageToAddOpen(false); // Fermer l'autre select
      if (!isDefaultLanguageOpen) {
        setTimeout(() => defaultLanguageInputRef.current?.focus(), 100);
      } else {
        setSearchDefaultLanguage("");
      }
    }
  };

  // Fonction pour ajouter une langue
  const handleAddLanguage = async () => {
    if (!selectedLanguageToAdd) return;

    const selectedLang = availableLanguages.find(lang => 
      `${lang.name} (${lang.iso})` === selectedLanguageToAdd
    );
    
    if (!selectedLang) return;

    const languageEntry = `${selectedLang.name} (${selectedLang.iso})`;

    try {
      const updatedLanguages = [...addedLanguages, languageEntry];
      
      // Sauvegarder dans Framer selon la documentation officielle
      await framer.setPluginData("addedLanguages", JSON.stringify(updatedLanguages));
      
      // Mettre à jour l'état local
      setAddedLanguages(updatedLanguages);
      setSelectedLanguageToAdd("");
      setSearchAddLanguage("");
      
    } catch (error) {
      alert("Error adding language. Please try again.");
    }
  };

  // Fonction pour commencer le processus de définition de la langue par défaut
  const handleSetDefaultLanguageStart = () => {
    if (!selectedDefaultLanguage || isSettingDefault) return;

    setIsSettingDefault(true);
    setSetDefaultProgress(0);
    setRemainingSeconds(5);

    // Compteur des secondes restantes
    secondsIntervalRef.current = window.setInterval(() => {
      setRemainingSeconds(prev => {
        const newSeconds = prev - 1;
        return newSeconds < 0 ? 0 : newSeconds;
      });
    }, 1000);

    // Barre de progression simple : 2% toutes les 100ms pour atteindre 100% en 5 secondes
    setDefaultIntervalRef.current = window.setInterval(() => {
      setSetDefaultProgress(prev => {
        const newProgress = prev + 2.24; // 2% toutes les 100ms = 20% par seconde
        if (newProgress >= 100) {
          return 100;
        }
        return newProgress;
      });
    }, 100); // Mise à jour toutes les 100ms

    // Exécuter l'action après 5 secondes
    setDefaultTimeoutRef.current = window.setTimeout(async () => {
      try {
        // Sauvegarder dans Framer avec la clé "defaultLanguage"
        await framer.setPluginData("defaultLanguage", selectedDefaultLanguage);
        
        // Mettre à jour l'état local
        setCurrentDefaultLanguage(selectedDefaultLanguage);
        setSelectedDefaultLanguage("");
        setSearchDefaultLanguage("");
        
      } catch (error) {
        alert("Error setting default language. Please try again.");
      } finally {
        clearSetDefaultTimers();
      }
    }, 5000);
  };

  // Fonction pour annuler le processus
  const handleSetDefaultLanguageCancel = () => {
    clearSetDefaultTimers();
  };

  // Fonction pour gérer le clic sur la croix de suppression
  const handleDeleteClick = async (language: string) => {
    if (languageToDelete === language) {
      // Deuxième clic : supprimer la langue
      try {
        const updatedLanguages = addedLanguages.filter(lang => lang !== language);
        
        // Sauvegarder dans Framer
        await framer.setPluginData("addedLanguages", JSON.stringify(updatedLanguages));
        
        // Si la langue supprimée était la langue par défaut, la réinitialiser
        if (currentDefaultLanguage === language) {
          await framer.setPluginData("defaultLanguage", "");
          setCurrentDefaultLanguage("");
        }
        
        // Mettre à jour l'état local
        setAddedLanguages(updatedLanguages);
        setLanguageToDelete(null);
        
      } catch (error) {
        alert("Error removing language. Please try again.");
      }
    } else {
      // Premier clic : marquer pour suppression
      setLanguageToDelete(language);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay sombre */}
      <div 
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(6px)",
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
        onClick={onClose}
      />
      
      {/* Contenu du popup */}
      <div
        className="configuration-popup-container"
        style={{
          position: "fixed",
          display: "flex",
          flexDirection: "column",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "#111111",
          borderRadius: "14px",
          boxShadow: "0 4px 30px rgba(0,0,0,0.5)",
          width: "650px",
          height: "450px",
          zIndex: 9999,
          color: "#FFF"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header avec titre et bouton fermer */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "15px",
          paddingBottom: "10px",
        }}>
          <h2 style={{
            margin: "0",
            color: "#FFF",
            fontSize: "15px",
            fontWeight: "500",
            lineHeight: "1.2",
            }}>
            Settings
          </h2>
          
          <button
            onClick={onClose}
            className="popup-close-button"
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#FFF";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#999";
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="transparent" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5 5 11m0-6 6 6"></path></svg>
          </button>
        </div>
        <hr className="configuration-popup-header-separator"/>
        
        {/* Contenu du popup */}
        <div className="configuration-popup-content-container">
          <div className="configuration-popup-left-column" style={{
            display: "flex",
            flexDirection: "column",
            height: "100%"
          }}>
            <h2 className="configuration-popup-section-title">
              Add a language
            </h2>
            <div className="configuration-popup-select-add-container">
              {/* SELECT PERSONNALISÉ avec RECHERCHE pour choisir une langue */}
              <div ref={addLanguageSelectRef} style={{ position: 'relative', display: 'block', width: '100%', marginBottom: "12px"}}>
                <div 
                  onClick={() => handleOpenSelect('add')}
                  style={{
                    backgroundColor: '#2B2B2B',
                    height: '30px',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 12px',
                    display: 'flex',
                    color: '#fff',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    width: '100%',
                    userSelect: "none",
                    fontSize: '14px',
                  }}
                >
                  {selectedLanguageToAdd || "Select a language..."}
                  <svg 
                    fill="none" 
                    stroke="currentColor" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth="2" 
                    viewBox="0 0 16 16" 
                    height="1.5em" 
                    width="1.5em"
                    style={{ 
                      transform: isLanguageToAddOpen ? 'rotate(90deg)' : 'rotate(-90deg)',
                    }}
                  >
                    <polyline points="6,4 10,8 6,12"></polyline>
                  </svg>
                </div>

                {isLanguageToAddOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    backgroundColor: '#2B2B2B',
                    borderTop: 'none',
                    borderRadius: '8px 8px 8px 8px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1000
                  }}>
                    {/* Champ de recherche */}
                    <input
                      ref={addLanguageInputRef}
                      type="text"
                      value={searchAddLanguage}
                      onChange={(e) => setSearchAddLanguage(e.target.value)}
                      placeholder="Search languages..."
                      style={{
                        width: '100%',
                        height: '30px',
                        padding: '0 12px',
                        backgroundColor: '#333',
                        color: '#fff',
                        border: 'none',
                        borderBottom: '1px solid #444',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    {/* Liste des langues filtrées */}
                    {filteredAvailableLanguages.map((lang) => (
                      <div
                        key={lang.iso}
                        onClick={() => {
                          setSelectedLanguageToAdd(`${lang.name} (${lang.iso})`);
                          setIsLanguageToAddOpen(false);
                          setSearchAddLanguage("");
                        }}
                        style={{
                          height: '30px',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 12px',
                          color: '#fff',
                          cursor: 'pointer',
                          backgroundColor: selectedLanguageToAdd === `${lang.name} (${lang.iso})` ? '#444' : 'transparent',
                          fontSize: '14px'
                        }}
                        onMouseEnter={(e) => (e.target as HTMLDivElement).style.backgroundColor = '#444'}
                        onMouseLeave={(e) => (e.target as HTMLDivElement).style.backgroundColor = selectedLanguageToAdd === `${lang.name} (${lang.iso})` ? '#444' : 'transparent'}
                      >
                        {lang.name} ({lang.iso})
                      </div>
                    ))}
                    
                    {filteredAvailableLanguages.length === 0 && searchAddLanguage && (
                      <div style={{
                        height: '30px',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 12px',
                        color: '#666',
                        fontSize: '14px'
                      }}>
                        No languages found
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bouton Add */}
              <button
                onClick={handleAddLanguage}
                disabled={!selectedLanguageToAdd}
                style={{
                  width: "100%",
                  padding: "10px",
                  backgroundColor: selectedLanguageToAdd ? "#0099FF" : "#444",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "8px",
                  cursor: selectedLanguageToAdd ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  fontWeight: "500",
                  transition: "background-color 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  if (selectedLanguageToAdd) {
                    e.currentTarget.style.backgroundColor = "#007acc";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedLanguageToAdd) {
                    e.currentTarget.style.backgroundColor = "#0099FF";
                  }
                }}
              >
                Add
              </button>
            </div>

            <h2 className="configuration-popup-section-title" style={{ 
              marginTop: "24px",
              marginBottom: "8px",
              flexShrink: 0
            }}>
              Language list
            </h2>

            {/* Liste des langues ajoutées */}
            <div style={{
              height: "0",
              flex: "1 1 0",
              overflowY: "auto",
              border: "1px solid #333",
              borderRadius: "8px",
              padding: "7px 8px 7px 8px",
            }}>
              {addedLanguages.length === 0 ? (
                <div style={{
                  color: "#666",
                  fontSize: "14px",
                  fontStyle: "italic",
                  textAlign: "center",
                  padding: "20px"
                }}>
                  No languages added yet
                </div>
              ) : (
                addedLanguages.map((language, index) => (
                  <div key={index} style={{
                    display: "flex",
                    height: "30px",
                    padding: "0px 8px",
                    alignItems: "center",
                    backgroundColor: "#2B2B2B",
                    margin: "6px 0",
                    borderRadius: "8px",
                    fontSize: "14px",
                    position: "relative"
                  }}>
                    {language}
                    {language === currentDefaultLanguage && (
                      <span style={{
                        position: "absolute",
                        right: "8px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "11px",
                        color: "#FFF",
                        fontWeight: "500"
                      }}>
                        DEFAULT
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
          
          <hr className="configuration-popup-separator"/>
          
          <div className="configuration-popup-right-column" style={{
            display: "flex",
            flexDirection: "column",
            height: "100%"
          }}>
            <div className="configuration-popup-right-up-container" style={{
              display: "flex",
              flexDirection: "column",
              flex: 1
            }}>
              <h2 className="configuration-popup-section-title" style={{ 
                marginBottom: "8px",
                flexShrink: 0
              }}>
                Remove a language
              </h2>

              {/* Liste des langues à supprimer */}
              <div style={{
                height: "0",
                flex: "1 1 0",
                overflowY: "auto",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "7px 8px 7px 8px",
              }}>
                {addedLanguages.length === 0 ? (
                  <div style={{
                    color: "#666",
                    fontSize: "14px",
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: "20px"
                  }}>
                    No languages to remove
                  </div>
                ) : (
                  addedLanguages.map((language, index) => {
                    const isMarkedForDeletion = languageToDelete === language;
                    const isDefaultLanguage = language === currentDefaultLanguage;
                    
                    return (
                      <div 
                        key={index} 
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          height: "30px",
                          padding: "0px 8px",
                          backgroundColor: "#2B2B2B",
                          margin: "6px 0",
                          borderRadius: "8px",
                          fontSize: "14px"
                        }}
                      >
                        <span>{language}</span>
                        {isDefaultLanguage ? (
                          <span style={{
                            fontSize: "11px",
                            color: "#FFF",
                            fontWeight: "500",
                            padding: "2px 6px",
                            borderRadius: "4px"
                          }}>
                            DEFAULT
                          </span>
                        ) : (
                          <button
                            data-delete-button="true"
                            onClick={() => handleDeleteClick(language)}
                            style={{
                              background: isMarkedForDeletion ? "rgb(250, 202, 202)" : "none",
                              border: "none",
                              color: isMarkedForDeletion ? "#d32f2f" : "#999",
                              cursor: "pointer",
                              padding: "2px",
                              borderRadius: "4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "16px",
                              height: "16px",
                              transition: "all 0.2s ease"
                            }}
                            onMouseEnter={(e) => {
                              if (!isMarkedForDeletion) {
                                e.currentTarget.style.backgroundColor = "#444";
                                e.currentTarget.style.color = "#FFF";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isMarkedForDeletion) {
                                e.currentTarget.style.backgroundColor = "transparent";
                                e.currentTarget.style.color = "#999";
                              }
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">
                              <path fill="transparent" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 3 3 9m0-6 6 6"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            
            <hr className="configuration-popup-header-separator"/>
            
            <div className="configuration-popup-right-down-container">
              <h2 className="configuration-popup-section-title" style={{
                marginBottom: "8px"
              }}>
                Set default language
              </h2>
              <div className="configuration-popup-select-add-container">
                {/* SELECT PERSONNALISÉ avec RECHERCHE pour choisir la langue par défaut */}
                <div ref={defaultLanguageSelectRef} style={{ position: 'relative', display: 'block', width: '100%', marginBottom: "12px" }}>
                  <div 
                    onClick={() => handleOpenSelect('default')}
                    style={{
                      backgroundColor: '#2B2B2B',
                      height: '30px',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0 12px',
                      display: 'flex',
                      color: '#fff',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      width: '100%',
                      userSelect: "none",
                      fontSize: '14px'
                    }}
                  >
                    {selectedDefaultLanguage || currentDefaultLanguage || "Search languages..."}
                    <svg 
                      fill="none" 
                      stroke="currentColor" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth="2" 
                      viewBox="0 0 16 16" 
                      height="1.5em" 
                      width="1.5em"
                      style={{ 
                        transform: isDefaultLanguageOpen ? 'rotate(90deg)' : 'rotate(-90deg)',
                      }}
                    >
                      <polyline points="6,4 10,8 6,12"></polyline>
                    </svg>
                  </div>

                  {isDefaultLanguageOpen && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      backgroundColor: '#2B2B2B',
                      borderTop: 'none',
                      borderRadius: '8px 8px 8px 8px',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      zIndex: 1000
                    }}>
                      {/* Champ de recherche */}
                      <input
                        ref={defaultLanguageInputRef}
                        type="text"
                        value={searchDefaultLanguage}
                        onChange={(e) => setSearchDefaultLanguage(e.target.value)}
                        placeholder="Search languages..."
                        style={{
                          width: '100%',
                          height: '30px',
                          padding: '0 12px',
                          backgroundColor: '#333',
                          color: '#fff',
                          border: 'none',
                          fontSize: '14px',
                          outline: 'none'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      
                      {/* Liste des langues filtrées */}
                      {filteredAddedLanguages.map((language, index) => (
                        <div
                          key={index}
                          onClick={() => {
                            setSelectedDefaultLanguage(language);
                            setIsDefaultLanguageOpen(false);
                            setSearchDefaultLanguage("");
                          }}
                          style={{
                            height: '30px',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 12px',
                            color: '#fff',
                            cursor: 'pointer',
                            backgroundColor: selectedDefaultLanguage === language ? '#444' : 'transparent',
                            fontSize: '14px'
                          }}
                          onMouseEnter={(e) => (e.target as HTMLDivElement).style.backgroundColor = '#444'}
                          onMouseLeave={(e) => (e.target as HTMLDivElement).style.backgroundColor = selectedDefaultLanguage === language ? '#444' : 'transparent'}
                        >
                          {language}
                        </div>
                      ))}
                      
                      {filteredAddedLanguages.length === 0 && searchDefaultLanguage && (
                        <div style={{
                          height: '30px',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 12px',
                          color: '#666',
                          fontSize: '14px'
                        }}>
                          No languages found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bouton Set avec confirmation de 5 secondes */}
                <button
                  onMouseDown={handleSetDefaultLanguageStart}
                  onMouseUp={handleSetDefaultLanguageCancel}
                  onMouseLeave={handleSetDefaultLanguageCancel}
                  disabled={!selectedDefaultLanguage}
                  style={{
                    width: "100%",
                    padding: "10px",
                    backgroundColor: isSettingDefault ? "#2B2B2B" : (selectedDefaultLanguage ? "#0099FF" : "#444"),
                    color: "#FFF",
                    border: "none",
                    borderRadius: "8px",
                    cursor: selectedDefaultLanguage ? "pointer" : "not-allowed",
                    fontSize: "14px",
                    fontWeight: "500",
                    transition: "background-color 0.2s ease",
                    position: "relative",
                    overflow: "hidden"
                  }}
                >
                  {/* Barre de progression */}
                  {isSettingDefault && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "0",
                        left: "0",
                        height: "3px",
                        backgroundColor: "#00BFFF",
                        width: `${setDefaultProgress}%`,
                        transition: "width 0.1s linear",
                        borderRadius: "0 0 8px 8px"
                      }}
                    />
                  )}
                  
                  {/* Texte du bouton */}
                  <span style={{ 
                    position: "relative", 
                    zIndex: 1,
                    color: isSettingDefault && remainingSeconds < 5 ? "#d32f2f" : "#FFF"
                  }}>
                    {isSettingDefault 
                      ? (remainingSeconds === 5 ? `Set (${remainingSeconds}s)` : `Are you sure ?? (${remainingSeconds}s)`)
                      : "Set (5s)"
                    }
                  </span>
                </button>
              </div>
            </div>
          </div> 
        </div>
      </div>
    </>
  );
}


// -----------------------------------------------------------------------------
// TRANSLATION-PAGE
//  - Liste live des TextNodes sur le Canvas
//  - Champ traduction par langue + bouton "Appliquer"
//  - Auto-refresh quand nodes ajoutés/supprimés
//  - NOUVEAU: Affichage des slugs CMS dans la console
//  - NOUVEAU: Bouton pour accéder à la nouvelle page de traduction
// -----------------------------------------------------------------------------

interface TextWithNode {
    text: string;
    node: any;      // Framer TextNode
    translation: string;
}

export function Translationpage({ setCurrentPage }: { setCurrentPage: (page: "start" | "license" | "home" | "export" | "configuration" | "newtranslation") => void }) {
    const [languages, setLanguages] = useState<{ name: string; iso: string }[]>([]);
    const [selectedLanguageIso, setSelectedLanguageIso] = useState<string>("");
    const [defaultLanguageIso, setDefaultLanguageIso] = useState<string>("");
    const [textsWithNodes, setTextsWithNodes] = useState<TextWithNode[]>([]);
    const [isApplying, setIsApplying] = useState(false);
    const lastTextSnapshot = useRef<string[]>([]);

    /* ----- Fonction pour récupérer tous les slugs des collections CMS ----- */
    const fetchAllCMSSlugs = async () => {
        try {
            console.log("🔍 Récupération de toutes les collections CMS...");
            
            // Vérifier si l'API getCollections est disponible
            if (!framer.getCollections) {
                console.error("❌ L'API framer.getCollections() n'est pas disponible");
                return;
            }

            // Récupérer toutes les collections
            const collections = await framer.getCollections();
            
            if (!collections || collections.length === 0) {
                console.log("📭 Aucune collection CMS trouvée dans ce projet");
                return;
            }

            console.log(`📊 ${collections.length} collection(s) CMS trouvée(s)`);
            console.log("=".repeat(60));

            // Parcourir chaque collection
            for (let i = 0; i < collections.length; i++) {
                const collection = collections[i];
                
                try {
                    console.log(`\n📁 Collection ${i + 1}:`);
                    console.log(`   Nom: ${collection.name || 'Sans nom'}`);
                    console.log(`   ID: ${collection.id}`);
                    
                    // Récupérer les items de cette collection
                    const items = await collection.getItems();
                    
                    if (!items || items.length === 0) {
                        console.log("   📭 Aucun item dans cette collection");
                        continue;
                    }
                    
                    console.log(`   📋 ${items.length} item(s) trouvé(s):`);
                    
                    // Afficher tous les slugs
                    items.forEach((item, itemIndex) => {
                        const slug = item.slug || 'pas de slug';
                        console.log(`      • Item ${itemIndex + 1}: "${slug}"`);
                    });
                    
                } catch (collectionError) {
                    console.error(`❌ Erreur lors de l'accès à la collection "${collection.name}":`, collectionError);
                }
            }
            
            console.log("\n" + "=".repeat(60));
            console.log("✅ Récupération des slugs CMS terminée");
            
        } catch (error) {
            console.error("💥 Erreur lors de la récupération des collections CMS:", error);
        }
    };

    /* ----- Charger la liste des langues & défauts une fois -------------------------------- */
    useEffect(() => {
        const loadData = async () => {
            // Récupérer les langues depuis addedLanguages (même source que ConfigurationPopup)
            let addedLanguagesRaw = await framer.getPluginData("addedLanguages");
            let langs: { name: string; iso: string }[] = [];
            if (addedLanguagesRaw) {
              try {
                const addedLanguagesStrings = JSON.parse(addedLanguagesRaw);
                // Convertir le format "French (fr)" vers { name: "French", iso: "fr" }
                langs = addedLanguagesStrings.map((langStr: string) => {
                  const match = langStr.match(/^(.+) \(([^)]+)\)$/);
                  if (match) {
                    return { name: match[1], iso: match[2] };
                  }
                  return { name: langStr, iso: "" };
                });
              } catch {
                langs = [];
              }
            }
            setLanguages(langs);

            // Récupérer la langue par défaut depuis defaultLanguage
            const defaultLangRaw = await framer.getPluginData("defaultLanguage");
            let defaultIso = "";
            if (defaultLangRaw) {
              // Extraire l'ISO code du format "French (fr)"
              const match = defaultLangRaw.match(/\(([^)]+)\)$/);
              if (match) {
                defaultIso = match[1];
              }
            }
            setDefaultLanguageIso(defaultIso || "");


            const firstNonDefault = langs.find(l => l.iso !== defaultIso);
            if (firstNonDefault) setSelectedLanguageIso(firstNonDefault.iso);
            else setSelectedLanguageIso("");

            await fetchAllCMSSlugs();
        };
        loadData();
    }, []);

    /* ----- Utilitaire: rafraîchir la liste des TextNodes -------------------------------- */
    const checkAndUpdateTexts = async () => {
        if (!framer.getNodesWithType) return;
        const textNodes = await framer.getNodesWithType("TextNode");
        const newTextsWithNodes: TextWithNode[] = [];
        
        for (const node of textNodes) {
            const text = await node.getText();
            if (typeof text === "string" && text.trim() !== "") {
                const existingTranslation = selectedLanguageIso ? 
                    await node.getPluginData(selectedLanguageIso) : "";
                newTextsWithNodes.push({
                    text: text,
                    node: node,
                    translation: existingTranslation || ""
                });
            }
        }

        const newTexts = newTextsWithNodes.map(item => item.text);
        const hasChanged =
            newTexts.length !== lastTextSnapshot.current.length ||
            newTexts.some((txt, i) => txt !== lastTextSnapshot.current[i]);

        if (hasChanged || newTexts.length !== textsWithNodes.length) {
            setTextsWithNodes(newTextsWithNodes);
            lastTextSnapshot.current = newTexts;
        }
    };

    /* ----- Recharger les traductions quand langue change ------------------------ */
    const loadTranslationsForLanguage = async () => {
        if (!selectedLanguageIso || textsWithNodes.length === 0) return;

        const updatedTextsWithNodes = await Promise.all(
            textsWithNodes.map(async (item) => {
                const existingTranslation = await item.node.getPluginData(selectedLanguageIso);
                return {
                    ...item,
                    translation: existingTranslation || ""
                };
            })
        );

        setTextsWithNodes(updatedTextsWithNodes);
    };

    useEffect(() => {
        if (selectedLanguageIso) {
            loadTranslationsForLanguage();
        }
    }, [selectedLanguageIso]);

    /* ----- Écrire les changements de traduction dans l'état --------------------------- */
    const updateTranslation = (index: number, newTranslation: string) => {
        const updatedTextsWithNodes = [...textsWithNodes];
        updatedTextsWithNodes[index].translation = newTranslation;
        setTextsWithNodes(updatedTextsWithNodes);
    };

    /* ----- Persister les traductions vers les TextNodes --------------------------------- */
    const applyTranslations = async () => {
        if (!selectedLanguageIso) {
            framer.notify("Veuillez sélectionner une langue", { variant: "error" });
            return;
        }

        setIsApplying(true);
        try {
            for (const item of textsWithNodes) {
                if (item.translation.trim() !== "") {
                    await item.node.setPluginData(selectedLanguageIso, item.translation);
                }
            }
            framer.notify(
                `Traductions appliquées pour la langue ${selectedLanguageIso}!`, 
                { variant: "success" }
            );
        } catch (error) {
            console.error("Erreur lors de l'application des traductions:", error);
            framer.notify("Erreur lors de l'application des traductions", { variant: "error" });
        } finally {
            setIsApplying(false);
        }
    };

    /* ----- MutationObserver: détecter ajout/suppression TextNodes --------------------- */
    useEffect(() => {
        checkAndUpdateTexts();

        let rafId: number | null = null;
        const scheduleUpdate = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                checkAndUpdateTexts();
            });
        };

        const target = document.querySelector('[data-framer-canvas]') || document.body;
        if (!target) return;

        const observer = new MutationObserver(() => {
            scheduleUpdate();
        });

        observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        window.addEventListener("focus", scheduleUpdate);

        return () => {
            observer.disconnect();
            window.removeEventListener("focus", scheduleUpdate);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [selectedLanguageIso, textsWithNodes.length]);

    /* ----- Fonctions utilitaires pour détection de page ------------------------------ */
    const getPageNameFromPath = (path: string): string => {
        if (path === "/" || path === "") {
            return "Home";
        }
        
        const name = path.startsWith("/") ? path.substring(1) : path;
        
        if (name.length > 0) {
            return name.charAt(0).toUpperCase() + name.slice(1);
        }
        
        return "Home";
    };

    const detectCurrentPageViaCanvasRoot = async () => {
        try {            
            if (!framer.getCanvasRoot) {
                console.log("❌ framer.getCanvasRoot() n'est pas disponible");
                return;
            }
            
            const canvasRoot = await framer.getCanvasRoot();
            if (!canvasRoot) {
                console.log("❌ Impossible de récupérer le canvasRoot");
                return;
            }
            
            const rootNodeId = canvasRoot.id;
            console.log(`🎯 ID de la node racine du canvas: ${rootNodeId}`);
            
            if (!framer.getNodesWithType) {
                console.log("❌ framer.getNodesWithType() n'est pas disponible");
                return;
            }
            
            const webPageNodes = await framer.getNodesWithType("WebPageNode");
            if (!webPageNodes || webPageNodes.length === 0) {
                console.log("❌ Aucune WebPageNode trouvée");
                return;
            }
            
            console.log(`📊 ${webPageNodes.length} WebPageNodes trouvées`);
            
            console.log("📋 Liste de toutes les WebPageNodes:");
            webPageNodes.forEach((node: any, index: number) => {
                const pageName = getPageNameFromPath(node.path);
                console.log(`  WebPageNode ${index + 1}: id="${node.id}", path="${node.path}", nom="${pageName}"`);
            });
            
            let matchFound = false;
            for (const webPageNode of webPageNodes) {
                if (webPageNode.id === rootNodeId) {
                    const pageName = getPageNameFromPath(webPageNode.path || "");
                    console.log(`✅ CORRESPONDANCE TROUVÉE!`);
                    console.log(`🎉 Page Actuelle > ID: ${webPageNode.id}, Path: ${webPageNode.path}, Nom: ${pageName}`);
                    matchFound = true;
                    break;
                }
            }
            
            if (!matchFound) {
                console.log(`❌ Aucune correspondance trouvée pour l'ID: ${rootNodeId}`);
                console.log("🔍 IDs disponibles:", webPageNodes.map((n: any) => n.id).join(", "));
            }
            
        } catch (error) {
            console.error("💥 Erreur lors de la détection via getCanvasRoot():", error);
        }
    };

    /* ----- Détection de page via getCanvasRoot() toutes les 5 secondes --------------- */
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;

        detectCurrentPageViaCanvasRoot();
        
        interval = setInterval(detectCurrentPageViaCanvasRoot, 5000);

        return () => {
            if (interval) clearInterval(interval);
        };
    }, []);

    /* ----- Rendu ----------------------------------------------------------- */
    return (
        <div className="translation-header-container">
            {}
            <div style={{ marginBottom: 20 }}>
                <button
                    onClick={() => setCurrentPage("newtranslation")}
                    style={{
                        padding: "10px 20px",
                        borderRadius: 8,
                        border: "none",
                        background: "#3ae840",
                        color: "#fff",
                        fontFamily: "Poppins",
                        fontSize: 14,
                        fontWeight: "bold",
                        cursor: "pointer",
                        transition: "background 0.2s",
                    }}
                    onMouseOver={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = "#259b36";
                    }}
                    onMouseOut={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = "#3ae840";
                    }}
                >
                    🆕 Nouvelle page de traduction
                </button>
            </div>

            {/* Menu déroulant langues ------------------------------------------------ */}
            <div className="translation-selects-row">
                <div className="translation-select-wrapper">
                    <label className="input-title">Languages</label>
                    <select
                        className="translation-select"
                        value={selectedLanguageIso}
                        onChange={e => setSelectedLanguageIso(e.target.value)}
                    >
                        {languages
                            .filter(lang => lang.iso !== defaultLanguageIso)
                            .map(lang => (
                                <option key={lang.iso} value={lang.iso}>
                                    {lang.name} ({lang.iso})
                                </option>
                            ))}
                    </select>
                </div>
            </div>
                
            {/* Liste des textes -------------------------------------------------------- */}
            <label className="input-title" style={{marginTop: "10px"}}>Translations</label>
            <div className="translation-texts-list" style={{width: "100%" }}>
                {textsWithNodes.length === 0 && (
                    <div style={{ color: "#888", fontFamily: "Poppins", fontSize: 15, textAlign: "center" }}>
                        No texts found on this page.
                    </div>
                )}
                {textsWithNodes.map((item, idx) => (
                    <div
                        key={idx}
                        style={{
                            height: 35,
                            alignItems: "center",
                            display: "flex",
                            flexDirection: "row",
                            color: "#fff",
                            fontFamily: "Poppins",
                            fontSize: 16,
                            wordBreak: "break-word",
                            flex: "0 0 auto",
                        }}
                    >
                        <div style={{
                                height: 35,
                                alignItems: "center",
                                display: "flex",
                                background: "#232326",
                                borderRadius: 8,
                                flex: "47%",
                        }}>
                            <span style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", paddingLeft: 10, paddingRight: 10 }}>{item.text}</span>
                        </div>
                        <span style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 8px",
                            color: "#888",
                            fontWeight: "bold",
                            fontSize: 22,
                            flex:"6%", 
                        }}>{'>'}</span>
                        <input
                            type="text"
                            placeholder="Translation"
                            value={item.translation}
                            onChange={(e) => updateTranslation(idx, e.target.value)}
                            style={{
                                minWidth: 0,
                                height: 35,
                                borderRadius: 8,
                                border: "1px solid #2f2f2f",
                                background: "#18181B",
                                color: "#fff",
                                fontFamily: "Poppins",
                                fontSize: 15,
                                padding: "0 10px",
                                outline: "none",
                                flex: "47%",
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Bouton appliquer ----------------------------------------------------- */}
            {textsWithNodes.length > 0 && (
                <div style={{ 
                    marginTop: 20, 
                    width: "100%", 
                    display: "flex", 
                    justifyContent: "center" 
                }}>
                    <button
                        onClick={applyTranslations}
                        disabled={isApplying || !selectedLanguageIso}
                        style={{
                            padding: "12px 24px",
                            borderRadius: 8,
                            border: "none",
                            background: isApplying ? "#666" : "#3ae840",
                            color: "#fff",
                            fontFamily: "Poppins",
                            fontSize: 16,
                            fontWeight: "bold",
                            cursor: isApplying ? "not-allowed" : "pointer",
                            transition: "background 0.2s",
                        }}
                        onMouseOver={e => {
                            if (!isApplying && selectedLanguageIso) {
                                (e.currentTarget as HTMLButtonElement).style.background = "#259b36";
                            }
                        }}
                        onMouseOut={e => {
                            if (!isApplying && selectedLanguageIso) {
                                (e.currentTarget as HTMLButtonElement).style.background = "#3ae840";
                            }
                        }}
                    >
                        {isApplying ? "Applying..." : "Apply Translations"}
                    </button>
                </div>
            )}
        </div>
    );
}

// -----------------------------------------------------------------------------
// LICENSE-FLOW
//  - Assistant à trois panneaux: vérifier clé → lier au projet → succès final
//  - Persiste LICENSE / framerProjectId dans les données du plugin
// -----------------------------------------------------------------------------

function LicensePage({ onComplete }: { onComplete: () => void }) {
    const [licenseKey, setLicenseKey] = useState("");
    const [storedLicense, setStoredLicense] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ message: string; type: "success" | "error" } | null>(null);
    const [currentPanel, setCurrentPanel] = useState(0);
    const [isLinkConfirmMode, setIsLinkConfirmMode] = useState(false);
    const [linkConfirmValue, setLinkConfirmValue] = useState("");

    /* ----- Chargement initial: récupérer licence sauvée & auto-étape assistant ------------ */
    useEffect(() => {
        const loadLicense = async () => {
            try {
                let projId = await framer.getPluginData("framerProjectId");
                if (!projId && framer.getProjectInfo) {
                    const info = await framer.getProjectInfo();
                    if (info && info.id) {
                        projId = info.id;
                        await framer.setPluginData("framerProjectId", projId);
                    }
                }
                const license = await framer.getPluginData("LICENSE");

                if (license) {
                    setStoredLicense(license);
                    licenseKeyGlobal = license;
                }

                projectIdGlobal = projId;

                if (!license || !projId) return;

                const response = await fetch("https://framerloc.vercel.app/api/supabase/license", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ license: license }),
                });

                const result = await response.json();

                if (result.exists && result.project_id === projId) {
                    setCurrentPanel(2);
                }

            } catch (error) {
                console.error("Error checking link status:", error);
            }
        };

        loadLicense();
    }, []);

    /* Auto-dismissal du toast */
    useEffect(() => {
        if (status) {
            const timer = setTimeout(() => setStatus(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    /* Auto-avancement une fois licence validée */
    useEffect(() => {
        if (status?.type === "success" && currentPanel === 0) {
            const timer = setTimeout(() => setCurrentPanel(1), 1000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    /* ----- Étape-1: valider contre LemonSqueezy --------------------------- */
    const validateLicense = async () => {
        setIsLoading(true);
        setStatus(null);

        try {
            console.log('🔍 Validation de la licence avec LemonSqueezy...');
            const validateRes = await fetch("https://framerloc.vercel.app/api/license/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ license_key: licenseKey }),
            });

            const validateData = await validateRes.json();

            if (!validateRes.ok || !validateData.valid) {
                const errorMessage = validateData.error ||
                    (validateData.license_key?.status === "expired" ? "Licence expirée"
                    : validateData.license_key?.status === "disabled" ? "Licence désactivée"
                    : "Clé de licence invalide");
                
                setStatus({ message: errorMessage, type: "error" });
                framer.notify(errorMessage, { variant: "error" });
                return;
            }

            console.log('✅ Licence valide côté LemonSqueezy');

            /* Récupérer / vérifier l'ID du projet ----------------------------- */
            let projId = await framer.getPluginData("framerProjectId");
            if (!projId && framer.getProjectInfo) {
                const info = await framer.getProjectInfo();
                if (info?.id) {
                    projId = info.id;
                    await framer.setPluginData("framerProjectId", projId);
                }
            }

            if (!projId) {
                setStatus({ message: "Impossible de récupérer l'ID du projet", type: "error" });
                framer.notify("Impossible de récupérer l'ID du projet", { variant: "error" });
                return;
            }

            console.log('📁 ID du projet récupéré:', projId);

            /* Vérifier si licence existe déjà dans Supabase --------------- */
            console.log('🔗 Vérification de la licence dans Supabase...');
            const licenseCheckRes = await fetch("https://framerloc.vercel.app/api/supabase/license", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ license: licenseKey }),
            });

            const licenseCheckData = await licenseCheckRes.json();

            if (licenseCheckRes.ok && licenseCheckData.exists) {
                if (licenseCheckData.project_id === projId) {
                    await framer.setPluginData("LICENSE", licenseKey);
                    licenseKeyGlobal = licenseKey;
                    projectIdGlobal = projId;
                    setStoredLicense(licenseKey);

                    framer.notify("Licence déjà liée à ce projet !", { variant: "success" });
                    setStatus({ message: "Licence déjà liée à ce projet !", type: "success" });
                    setTimeout(() => onComplete(), 1000);
                    return;
                } else {
                    setStatus({ 
                        message: `Cette licence est déjà liée au projet ${licenseCheckData.project_id}`, 
                        type: "error" 
                    });
                    framer.notify(`Cette licence est déjà liée à un autre projet`, { variant: "error" });
                    return;
                }
            }

            /* Vérifier si projet est déjà lié à une autre licence ---------- */
            console.log('🔍 Vérification si le projet est lié à une autre licence...');
            const projectCheckRes = await fetch("https://framerloc.vercel.app/api/supabase/project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: projId }),
            });

            const projectCheckData = await projectCheckRes.json();

            if (projectCheckRes.ok && projectCheckData.exists) {
                setStatus({ 
                    message: `Ce projet Framer est déjà lié à une autre licence (${projectCheckData.license_key})`, 
                    type: "error" 
                });
                framer.notify(`Ce projet Framer est déjà lié à une autre licence`, { variant: "error" });
                return;
            }

            /* Si tout OK, sauvegarder licence et passer au panneau 2 ------ */
            await framer.setPluginData("LICENSE", licenseKey);
            licenseKeyGlobal = licenseKey;
            projectIdGlobal = projId;
            setStoredLicense(licenseKey);

            console.log('✅ Licence validée, passage au panel de liaison');
            framer.notify("Licence valide. Veuillez lier votre projet.", { variant: "success" });
            setStatus({ message: "Licence valide. Veuillez lier votre projet.", type: "success" });

        } catch (err: any) {
            console.error('💥 Erreur inattendue:', err);
            setStatus({ message: "Erreur de connexion au serveur", type: "error" });
            framer.notify("Erreur de connexion au serveur", { variant: "error" });
        } finally {
            setIsLoading(false);
        }
    };

    /* ----- Étape-2: utilisateur confirme chaîne "link-framer" --------------------- */
    const handleLinkConfirm = async () => {
        if (linkConfirmValue.toLowerCase() === "link-framer" && licenseKeyGlobal && projectIdGlobal) {
            try {
                const currentUser = await framer.getCurrentUser();
                const userName = currentUser?.name?.trim() || 'unknown';
                
                const res = await fetch("https://framerloc.vercel.app/api/link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        license: licenseKeyGlobal, 
                        projectId: projectIdGlobal, 
                        userName 
                    }),
                });

                const data = await res.json();

                if (!res.ok || !data.success) {
                    framer.notify(data.error || "Linking failed", { variant: "error" });
                    return;
                }

                /* Double-vérification de la paire ----------------------------- */
                const checkRes = await fetch("https://framerloc.vercel.app/api/supabase/license", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ license: licenseKeyGlobal }),
                });
                
                const checkData = await checkRes.json();

                if (checkData.exists && checkData.project_id === projectIdGlobal) {
                    await framer.setPluginData("framerProjectId", projectIdGlobal);
                    framer.notify("License linked successfully!", { variant: "success" });
                    setTimeout(() => setCurrentPanel(2), 1000);
                } else {
                    framer.notify("Linking failed. Please try again.", { variant: "error" });
                }
            } catch (error: any) {
                console.error("Linking error:", error);
                framer.notify("An error occurred while linking the license.", { variant: "error" });
            }
        }
    };

    const handleDotClick = (panelIndex: number) => {
        if (panelIndex < currentPanel || status?.type === "success") {
            setCurrentPanel(panelIndex);
        }
    };

    /* ----- Rendu trois panneaux glissants ------------------------------------- */
    return (
        <div className="license-wrapper">
            <div className="panels-container" style={{ transform: `translateX(calc(-${currentPanel * 33.33}% - ${currentPanel * 50}px))` }}>
                {/* --- Panel-1: Valider clé -------------------------------- */}
                <div className="panel">
                    <img src="logo.png" alt="Logo" style={{ width: "65%", height: "auto" }} />
                    <h1 className="home-title">Activate FramerLoc</h1>
                    <p className="home-p">Verify your license key to unlock all features and start using FramerLoc for your localization needs.</p>
                    <div className="home-buttons">
                        <div className="input-verify-container">
                            <input
                                type="text"
                                value={licenseKey}
                                onChange={(e) => setLicenseKey(e.target.value)}
                                placeholder="LICENSE KEY"
                                className="input-text"
                                disabled={isLoading}
                            />
                            <button
                                className={`home-button-primary ${isLoading ? "loading" : ""} ${status?.type === "success" ? "success" : status?.type === "error" ? "error" : ""}`}
                                onClick={validateLicense}
                                disabled={!licenseKey || status?.type === "success" || isLoading}
                            >
                                {isLoading ? <Loader /> : (status?.type === "success" ? "Success!" : status?.type === "error" ? "Error!" : "Verify")}
                            </button>
                        </div>
                    </div>
                    <ProgressDots currentPanel={currentPanel} onDotClick={handleDotClick} />
                </div>

                {/* --- Panel-2: Lier au projet ----------------------------- */}
                <div className="panel">
                    <img src="logo.png" alt="Logo" style={{ width: "65%", height: "auto" }} />
                    <h1 className="home-title">Link FramerLoc</h1>
                    <p className="home-p">Link your Framer project with FramerLoc to start managing translations.</p>
                    <div className="home-buttons">
                        <div className="input-verify-container">
                            {!isLinkConfirmMode ? (
                                <button className="home-button-primary" onClick={() => setIsLinkConfirmMode(true)}>Link</button>
                            ) : (
                                <div className="link-confirm-container">
                                    <input
                                        type="text"
                                        value={linkConfirmValue}
                                        onChange={(e) => setLinkConfirmValue(e.target.value)}
                                        placeholder="Type 'link-framer' to confirm"
                                        className="input-text"
                                    />
                                    <div className="link-buttons-container">
                                        <button 
                                            className="confirm-link-button"
                                            onClick={handleLinkConfirm}
                                            disabled={linkConfirmValue.toLowerCase() !== 'link-framer'}
                                        >✓</button>
                                        <button 
                                            className="cancel-link-button"
                                            onClick={() => { setIsLinkConfirmMode(false); setLinkConfirmValue(""); }}
                                        >✕</button>
                                    </div>
                                </div>
                            )} 
                        </div>
                    </div>
                    <ProgressDots currentPanel={currentPanel} onDotClick={handleDotClick} />
                </div>

                {/* --- Panel-3: Succès ------------------------------------- */}
                <div className="panel">
                    <img src="logo.png" alt="Logo" style={{ width: "65%", height: "auto" }} />
                    <h1 className="home-title">You're all set!</h1>
                    <p className="home-p">Start translating your Framer projects</p>
                    <div className="home-buttons">
                        <div className="input-verify-container">
                            <button className="home-button-primary" onClick={onComplete}>Start Using FramerLoc</button>
                        </div>
                    </div>
                    <ProgressDots currentPanel={currentPanel} onDotClick={handleDotClick} />
                </div>
            </div>
        </div>
    );
}

// -----------------------------------------------------------------------------
// EXPORT-PAGE
//  - Placeholder simple en attendant que la fonctionnalité d'export soit construite
// -----------------------------------------------------------------------------

function ExportPage() {
    return (
        <div className="home-container">
            <img src="logo.png" alt="Logo" style={{ width: "65%", height: "auto" }} />
            <h1 className="home-title">Export</h1>
            <p className="setup-p">Here you can export your FramerLoc plugin data.</p>
        </div>
    );
}
