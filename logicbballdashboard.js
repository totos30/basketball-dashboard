        // ============================================
        // VARIABLES GLOBALES
        // ============================================
        let basketballData = [];
        let filteredData = [];
        let charts = {};
        let customPositiveActions = [];
        let customNegativeActions = [];
        let selectedStats = []; // Sera rempli dynamiquement avec les actions du CSV

		let businessRules = [
			{
				"id": "rule_1",
				"name": "Possession",
				"sequence": [
					{
						"type": "group",
						"items": [
							"Interceptions",
							"Passes décisive",
							"Rebond def.",
							"Rebond off."
						],
						"operator": "OU"
					}
				],
				"tolerance": 0,
				"isPositive": true,
				"isActive": true,
				"color": "#2c5aa0"
			},
			{
				"id": "rule_3",
				"name": "Rebond + 2 points",
				"sequence": [
					{
						"type": "group",
						"items": [
							"Rebond off.",
							"2 Points"
						],
						"operator": "ET"
					},
					"OU",
					{
						"type": "group",
						"items": [
							"Rebond def.",
							"2 Points"
						],
						"operator": "ET"
					}
				],
				"tolerance": 1,
				"isPositive": true,
				"isActive": true,
				"color": "#dc2626"
			}
		];
		let ruleMatches = [];
		let nextRuleId = 4;
		let tempRuleGroups = []; // Structure: [{type: "group", items: [], operator: "ET"}, "ET", {...}]
		let currentGroupIndex = 0;
		let usedColors = new Set();

		// Palette de couleurs diversifiées pour les règles
		const ruleColorPalette = [
			'#2c5aa0', '#dc2626', '#16a34a', '#ea580c', '#7c3aed',
			'#0891b2', '#ca8a04', '#db2777', '#65a30d', '#0284c7',
			'#c026d3', '#059669', '#d97706', '#8b5cf6', '#14b8a6',
			'#f59e0b', '#10b981', '#6366f1', '#ec4899', '#84cc16'
		];

		// États de sections
		let businessRulesSectionCollapsed = true;
        let settingsSectionVisible = false;

        // Configuration de connexion aux données
        let dataSourceConfig = {
            type: 'googleDrive', // 'none', 'local', 'googleDrive'
            localFilePath: '',
            localFileData: null,
            googleSheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQHmdXQBbJFeDi2F-PJ7um5CagqGZulbsdabDzhd6mVJpzzeVSnEJzs6ytcVNu0fiFfdzoDBNUf2TfV/pub?gid=2139680927&single=true&output=csv'
        };

        // ============================================
        // GESTION DES PARAMÈTRES
        // ============================================

        function toggleSettings() {
            const settingsSection = document.getElementById('settingsSection');
            settingsSectionVisible = !settingsSectionVisible;

            if (settingsSectionVisible) {
                settingsSection.classList.remove('hidden');
            } else {
                settingsSection.classList.add('hidden');
            }
        }

        function exportConfiguration() {
            const config = {
                version: "1.0",
                exportDate: new Date().toISOString(),
                customPositiveActions: customPositiveActions,
                customNegativeActions: customNegativeActions,
                businessRules: businessRules,
                dataSourceConfig: {
                    type: dataSourceConfig.type,
                    googleSheetUrl: dataSourceConfig.googleSheetUrl
                    // Ne pas exporter localFileData pour des raisons de taille
                }
            };

            const jsonContent = JSON.stringify(config, null, 2);
            const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `basketball_config_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            window.URL.revokeObjectURL(url);

            alert('✅ Configuration exportée avec succès !');
        }

        function importConfiguration(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const config = JSON.parse(e.target.result);

                    if (!config.version || !config.customPositiveActions) {
                        alert('❌ Format de fichier invalide');
                        return;
                    }

                    // Importer les catégories
                    customPositiveActions = config.customPositiveActions || [];
                    customNegativeActions = config.customNegativeActions || [];

                    // Importer les règles métier
                    businessRules = config.businessRules || [];
                    if (businessRules.length > 0) {
                        nextRuleId = Math.max(...businessRules.map(r => parseInt(r.id.replace('rule_', '')))) + 1;

                        // Restaurer les couleurs utilisées
                        usedColors.clear();
                        businessRules.forEach(rule => {
                            if (rule.color) {
                                usedColors.add(rule.color);
                            }
                        });
                    }

                    // Importer la config de source de données
                    if (config.dataSourceConfig) {
                        if (config.dataSourceConfig.googleSheetUrl) {
                            document.getElementById('googleSheetUrl').value = config.dataSourceConfig.googleSheetUrl;
                            dataSourceConfig.googleSheetUrl = config.dataSourceConfig.googleSheetUrl;
                        }
                    }

                    // Mettre à jour l'affichage si des données sont déjà chargées
                    if (basketballData.length > 0) {
                        const allActions = [...new Set(basketballData.map(d => d.Action))].sort();
                        updateCategoryConfiguration(allActions);
                        updateRulesList();
                        updateRulesToggleBanner();
                        detectRuleMatches();
                        updateDashboard();
                    }

                    alert(`✅ Configuration importée avec succès !\n\n` +
                          `- ${customPositiveActions.length} actions positives\n` +
                          `- ${customNegativeActions.length} actions négatives\n` +
                          `- ${businessRules.length} règles métier`);

                } catch (error) {
                    console.error('Erreur import:', error);
                    alert('❌ Erreur lors de l\'import de la configuration');
                }
            };

            reader.readAsText(file);
            event.target.value = '';
        }

        function handleDataSourceChange() {
            const sourceType = document.getElementById('dataSourceSelect').value;
            const localConnection = document.getElementById('localConnection');
            const googleDriveConnection = document.getElementById('googleDriveConnection');

            // Masquer toutes les options
            localConnection.classList.remove('visible');
            googleDriveConnection.classList.remove('visible');

            // Afficher l'option sélectionnée
            if (sourceType === 'local') {
                localConnection.classList.add('visible');
                dataSourceConfig.type = 'local';
            } else if (sourceType === 'googleDrive') {
                googleDriveConnection.classList.add('visible');
                dataSourceConfig.type = 'googleDrive';
            } else {
                dataSourceConfig.type = 'none';
            }

            // Sauvegarder la config
            saveDataSourceConfig();
        }

        function handleLocalFileSelection(event) {
            const file = event.target.files[0];
            if (!file) return;

            document.getElementById('localFilePath').value = file.name;

            // Lire et stocker le contenu du fichier
            const reader = new FileReader();
            reader.onload = function(e) {
                dataSourceConfig.localFilePath = file.name;
                dataSourceConfig.localFileData = e.target.result;
                saveDataSourceConfig();

                // Charger immédiatement les données
                parseCSVData(e.target.result);
                alert('✅ Fichier local enregistré comme source par défaut !');
            };
            reader.readAsText(file);
        }

        function saveGoogleSheetUrl() {
            const url = document.getElementById('googleSheetUrl').value.trim();
            if (!url) {
                alert('⚠️ Veuillez saisir une URL valide');
                return;
            }

            dataSourceConfig.googleSheetUrl = url;
            saveDataSourceConfig();

            // Tenter de charger les données
            loadFromGoogleSheet();
        }

        function testGoogleSheetConnection() {
            const url = document.getElementById('googleSheetUrl').value.trim();
            if (!url) {
                alert('⚠️ Veuillez saisir une URL pour tester');
                return;
            }

            // Sauvegarder temporairement l'URL actuelle
            const previousUrl = dataSourceConfig.googleSheetUrl;
            dataSourceConfig.googleSheetUrl = url;

            console.log('🧪 Test de connexion Google Sheet...');

            // Tester le chargement sans sauvegarder
            loadFromGoogleSheet();

            // Restaurer l'URL précédente si le test échoue
            setTimeout(() => {
                if (!basketballData || basketballData.length === 0) {
                    dataSourceConfig.googleSheetUrl = previousUrl;
                }
            }, 3000);
        }

        function saveDataSourceConfig() {
            try {
                const configToSave = {
                    type: dataSourceConfig.type,
                    localFilePath: dataSourceConfig.localFilePath,
                    localFileData: dataSourceConfig.localFileData,
                    googleSheetUrl: dataSourceConfig.googleSheetUrl
                };
                localStorage.setItem('dataSourceConfig', JSON.stringify(configToSave));
            } catch (e) {
                console.warn('Erreur sauvegarde config:', e);
            }
        }

        function loadDataSourceConfig() {
            try {
                const saved = localStorage.getItem('dataSourceConfig');
                if (saved) {
                    const config = JSON.parse(saved);
                    dataSourceConfig = config;

                    // Restaurer l'UI
                    document.getElementById('dataSourceSelect').value = config.type || 'none';

                    if (config.type === 'local' && config.localFilePath) {
                        document.getElementById('localFilePath').value = config.localFilePath;
                        handleDataSourceChange();

                        // Auto-charger si données disponibles
                        if (config.localFileData) {
                            parseCSVData(config.localFileData);
                        }
                    } else if (config.type === 'googleDrive' && config.googleSheetUrl) {
                        document.getElementById('googleSheetUrl').value = config.googleSheetUrl;
                        handleDataSourceChange();
                        loadFromGoogleSheet();
                    }
                } else {
                    // Aucune configuration sauvegardée, utiliser la configuration par défaut
                    console.log('📋 Utilisation de la configuration par défaut');

                    // Sauvegarder la configuration par défaut
                    saveDataSourceConfig();

                    // Restaurer l'UI avec les valeurs par défaut
                    document.getElementById('dataSourceSelect').value = dataSourceConfig.type;

                    if (dataSourceConfig.type === 'googleDrive' && dataSourceConfig.googleSheetUrl) {
                        document.getElementById('googleSheetUrl').value = dataSourceConfig.googleSheetUrl;
                        handleDataSourceChange();
                        loadFromGoogleSheet();
                    }
                }
            } catch (e) {
                console.warn('Erreur chargement config:', e);
            }
        }

        function loadFromGoogleSheet() {
            const url = dataSourceConfig.googleSheetUrl;
            if (!url) return;

            // Extraire l'ID du document Google Sheets
            let csvUrl = url;
            let sheetId = null;

            // Essayer d'extraire l'ID du document
            const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            const eIdMatch = url.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);

            if (eIdMatch) {
                // Format publication : /d/e/DOCUMENT_ID/pub
                sheetId = eIdMatch[1];
                csvUrl = `https://docs.google.com/spreadsheets/d/e/${sheetId}/pub?output=csv`;
                console.log('📄 Format publication détecté, ID:', sheetId);
            } else if (idMatch) {
                // Format édition : /d/DOCUMENT_ID/edit
                sheetId = idMatch[1];
                csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
                console.log('📄 Format édition détecté, ID:', sheetId);
            } else if (url.includes('output=csv') || url.includes('export?format=csv')) {
                // URL déjà au bon format
                csvUrl = url;
                console.log('📄 URL CSV détectée');
            }

            console.log('🔗 Chargement depuis:', csvUrl);

            // Tentative 1 : Fetch direct
            fetch(csvUrl, { mode: 'cors' })
                .then(response => {
                    console.log('📥 Réponse reçue:', response.status, response.statusText);
                    if (!response.ok) {
                        throw new Error(`Erreur HTTP ${response.status}`);
                    }
                    return response.text();
                })
                .then(csvData => {
                    console.log('✅ Données CSV reçues:', csvData.substring(0, 200) + '...');
                    parseCSVData(csvData);
                    alert('✅ Données chargées depuis Google Drive !');
                })
                .catch(error => {
                    console.error('❌ Erreur fetch direct:', error);

                    // Tentative 2 : Utiliser un proxy CORS
                    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}`;
                    console.log('🔄 Tentative avec proxy CORS:', proxyUrl);

                    fetch(proxyUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error('Erreur proxy CORS');
                            }
                            return response.text();
                        })
                        .then(csvData => {
                            console.log('✅ Données CSV reçues via proxy');
                            parseCSVData(csvData);
                            alert('✅ Données chargées depuis Google Drive (via proxy) !');
                        })
                        .catch(proxyError => {
                            console.error('❌ Erreur proxy CORS:', proxyError);
                            alert('❌ Impossible de charger le Google Sheet.\n\n' +
                                  'Erreurs rencontrées:\n' +
                                  `1. Fetch direct: ${error.message}\n` +
                                  `2. Proxy CORS: ${proxyError.message}\n\n` +
                                  'Solutions:\n' +
                                  '• Vérifiez que le fichier est bien publié\n' +
                                  '• Essayez d\'utiliser l\'import manuel (fichier local)');
                        });
                });
        }

        // ============================================
        // GESTION DES RÈGLES MÉTIER
        // ============================================

		function getNextUniqueColor() {
			// Trouver une couleur non utilisée
			for (let color of ruleColorPalette) {
				if (!usedColors.has(color)) {
					usedColors.add(color);
					return color;
				}
			}

			// Si toutes les couleurs sont utilisées, réinitialiser et prendre la première
			usedColors.clear();
			usedColors.add(ruleColorPalette[0]);
			return ruleColorPalette[0];
		}

		function releaseColor(color) {
			usedColors.delete(color);
		}

		function toggleBusinessRulesSection() {
			const content = document.getElementById('businessRulesContent');
			const icon = document.getElementById('toggleIcon');

			businessRulesSectionCollapsed = !businessRulesSectionCollapsed;

			if (businessRulesSectionCollapsed) {
				content.style.maxHeight = content.scrollHeight + 'px';
				setTimeout(() => {
					content.style.maxHeight = '0px';
					content.style.opacity = '0';
				}, 10);
				setTimeout(() => {
					content.style.display = 'none';
				}, 300);
				icon.textContent = '📈';
			} else {
				content.style.display = 'block';
				content.style.maxHeight = '0px';
				content.style.opacity = '0';
				setTimeout(() => {
					content.style.maxHeight = content.scrollHeight + 'px';
					content.style.opacity = '1';
				}, 10);
				setTimeout(() => {
					content.style.maxHeight = 'none';
				}, 300);
				icon.textContent = '📉';
			}
		}

		function initializeRuleActionsSelector() {
			if (basketballData.length === 0) return;

			const allActions = [...new Set(basketballData.map(d => d.Action))].sort();
			const container = document.getElementById('ruleActionsSelector');

			container.innerHTML = '<p style="margin: 0 0 10px 0; color: #34495e; font-weight: 600;">Cliquez pour ajouter des actions dans l\'ordre :</p>';

			const actionsGrid = document.createElement('div');
			actionsGrid.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

			allActions.forEach(action => {
				const btn = document.createElement('button');
				btn.textContent = action;
				btn.className = 'rule-action-btn';
				btn.style.cssText = `
					background: white;
					border: 2px solid #3498db;
					color: #3498db;
					padding: 8px 15px;
					border-radius: 5px;
					cursor: pointer;
					font-size: 0.9rem;
					transition: all 0.2s ease;
				`;

				btn.onmouseover = () => {
					btn.style.background = '#3498db';
					btn.style.color = 'white';
				};
				btn.onmouseout = () => {
					btn.style.background = 'white';
					btn.style.color = '#3498db';
				};

				btn.onclick = () => addActionToCurrentGroup(action);
				actionsGrid.appendChild(btn);
			});

			container.appendChild(actionsGrid);
		}

		function initializeRuleGroups() {
			// Initialiser avec un premier groupe vide
			tempRuleGroups = [{
				type: "group",
				items: [],
				operator: "ET" // Opérateur interne par défaut
			}];
			currentGroupIndex = 0;
		}

		function addActionToCurrentGroup(action) {
			if (tempRuleGroups.length === 0) {
				initializeRuleGroups();
			}

			const currentGroup = tempRuleGroups[currentGroupIndex];
			if (currentGroup && currentGroup.type === "group") {
				currentGroup.items.push(action);
				updateSequencePreview();
			}
		}

		function addNewGroup() {
			// Ajouter un opérateur ET par défaut entre les groupes
			tempRuleGroups.push("ET");

			// Ajouter un nouveau groupe vide
			tempRuleGroups.push({
				type: "group",
				items: [],
				operator: "ET"
			});

			currentGroupIndex = tempRuleGroups.length - 1;
			updateSequencePreview();
		}

		function toggleOperatorInGroup(groupIndex, operatorIndex) {
			const group = tempRuleGroups[groupIndex];
			if (group && group.type === "group") {
				// Pas d'opérateur interne pour l'instant, juste toggle du groupe
				group.operator = group.operator === "ET" ? "OU" : "ET";
				updateSequencePreview();
			}
		}

		function toggleOperatorBetweenGroups(operatorIndex) {
			if (typeof tempRuleGroups[operatorIndex] === "string") {
				tempRuleGroups[operatorIndex] = tempRuleGroups[operatorIndex] === "ET" ? "OU" : "ET";
				updateSequencePreview();
			}
		}

		function removeActionFromGroup(groupIndex, actionIndex) {
			const group = tempRuleGroups[groupIndex];
			if (group && group.type === "group") {
				group.items.splice(actionIndex, 1);

				// Si le groupe devient vide et qu'il y a plus d'un groupe, le supprimer
				if (group.items.length === 0 && tempRuleGroups.filter(g => typeof g === "object").length > 1) {
					// Supprimer le groupe et l'opérateur qui le précède ou le suit
					if (groupIndex > 0 && typeof tempRuleGroups[groupIndex - 1] === "string") {
						tempRuleGroups.splice(groupIndex - 1, 2);
						currentGroupIndex = Math.max(0, currentGroupIndex - 2);
					} else if (groupIndex < tempRuleGroups.length - 1 && typeof tempRuleGroups[groupIndex + 1] === "string") {
						tempRuleGroups.splice(groupIndex, 2);
						currentGroupIndex = Math.max(0, currentGroupIndex);
					} else {
						tempRuleGroups.splice(groupIndex, 1);
						currentGroupIndex = Math.max(0, currentGroupIndex - 1);
					}
				}

				updateSequencePreview();
			}
		}

		function updateSequencePreview() {
			const preview = document.getElementById('sequencePreview');

			if (tempRuleGroups.length === 0 || tempRuleGroups.every(g => g.type === "group" && g.items.length === 0)) {
				preview.innerHTML = 'vide';
				return;
			}

			let html = '';

			tempRuleGroups.forEach((element, idx) => {
				if (typeof element === "string") {
					// C'est un opérateur entre groupes
					html += `<button onclick="toggleOperatorBetweenGroups(${idx})"
						style="background: #2c3e50; color: white; padding: 6px 12px; border-radius: 5px;
						font-size: 0.85rem; border: none; cursor: pointer; margin: 0 5px; font-weight: bold;">
						${element} ▼
					</button>`;
				} else if (element.type === "group") {
					// C'est un groupe
					const groupHtml = element.items.map((action, actionIdx) => {
						let actionHtml = `<span style="background: #3498db; color: white; padding: 6px 12px; border-radius: 5px;
							font-size: 0.85rem; display: inline-flex; align-items: center; gap: 5px;">
							${actionIdx + 1}. ${action}
							<button onclick="removeActionFromGroup(${idx}, ${actionIdx})"
								style="background: rgba(255,255,255,0.3); border: none; border-radius: 3px;
								cursor: pointer; padding: 2px 6px; color: white; font-weight: bold;">×</button>
						</span>`;

						// Ajouter un opérateur interne si ce n'est pas la dernière action du groupe
						if (actionIdx < element.items.length - 1) {
							actionHtml += `<button onclick="toggleOperatorInGroup(${idx}, ${actionIdx})"
								style="background: #2c3e50; color: white; padding: 4px 8px; border-radius: 5px;
								font-size: 0.75rem; border: none; cursor: pointer; margin: 0 5px; font-weight: bold;">
								${element.operator} ▼
							</button>`;
						}

						return actionHtml;
					}).join(' ');

					// Encadrer le groupe visuellement
					html += `<span style="display: inline-flex; align-items: center; padding: 8px;
						border: 2px dashed #3498db; border-radius: 8px; margin: 0 5px; gap: 5px; background: rgba(52, 152, 219, 0.05);">
						${groupHtml || '<span style="color: #95a5a6; font-style: italic;">groupe vide</span>'}
					</span>`;
				}
			});

			preview.innerHTML = html;
		}

		function createBusinessRule() {
			const name = document.getElementById('ruleNameInput').value.trim();
			const isPositive = document.querySelector('input[name="ruleType"]:checked').value === 'positive';
			const tolerance = parseInt(document.getElementById('ruleTolerance').value) || 0;

			if (!name) {
				alert('⚠️ Veuillez donner un nom à la règle');
				return;
			}

			// Vérifier qu'il y a au moins un groupe avec des actions
			const totalActions = tempRuleGroups.filter(g => typeof g === "object").reduce((sum, g) => sum + g.items.length, 0);
			if (totalActions < 2) {
				alert('⚠️ Une règle doit contenir au moins 2 actions au total');
				return;
			}

			// Nettoyer les groupes vides avant de sauvegarder
			const cleanedGroups = [];
			tempRuleGroups.forEach((element, idx) => {
				if (typeof element === "string") {
					// C'est un opérateur - l'ajouter seulement si le groupe suivant n'est pas vide
					if (idx + 1 < tempRuleGroups.length && tempRuleGroups[idx + 1].items && tempRuleGroups[idx + 1].items.length > 0) {
						cleanedGroups.push(element);
					}
				} else if (element.type === "group" && element.items.length > 0) {
					cleanedGroups.push(element);
				}
			});

			// Sélectionner une couleur unique
			const color = getNextUniqueColor();

			const newRule = {
				id: `rule_${nextRuleId++}`,
				name: name,
				sequence: cleanedGroups, // Nouvelle structure avec groupes et opérateurs
				tolerance: tolerance, // Nombre d'actions intermédiaires autorisées
				isPositive: isPositive,
				isActive: true,
				color: color
			};

			businessRules.push(newRule);
			console.log('✅ Règle créée:', newRule);

			// Réinitialiser le formulaire
			document.getElementById('ruleNameInput').value = '';
			initializeRuleGroups();
			updateSequencePreview();

			// Ouvrir la section des règles métier si elle est réduite
			if (businessRulesSectionCollapsed) {
				toggleBusinessRulesSection();
			}

			console.log('📊 Données disponibles:', filteredData.length, 'actions');
			detectRuleMatches();
			console.log('🎯 Détections trouvées:', ruleMatches.length);
			updateRulesList();
			updateRulesToggleBanner();
			applyFilters();

			alert(`✅ Règle "${name}" créée avec succès !\n${ruleMatches.filter(m => m.ruleId === newRule.id).length} séquences détectées.`);
		}

		function updateRulesList() {
			const container = document.getElementById('rulesListContainer');

			if (businessRules.length === 0) {
				container.innerHTML = '<p style="color: #7f8c8d; font-style: italic; text-align: center; padding: 20px;">Aucune règle créée pour le moment</p>';
				return;
			}

			console.log('📋 Mise à jour de la liste des règles:', businessRules.length, 'règle(s)');

			container.innerHTML = businessRules.map(rule => {
				const detectionCount = ruleMatches.filter(m => m.ruleId === rule.id).length;
				console.log(`  - Règle "${rule.name}": ${detectionCount} détections`);

				// Afficher la séquence avec support des groupes
				let sequenceHtml = '';
				if (rule.sequence) {
					// Nouvelle structure avec groupes
					sequenceHtml = rule.sequence.map((element, idx) => {
						if (typeof element === "string") {
							return `<span style="color: #2c3e50; font-weight: bold; margin: 0 5px;">${element}</span>`;
						} else if (element.type === "group") {
							const groupContent = element.items.map((action, i) => {
								let html = `<span style="color: ${rule.color};">${action}</span>`;
								if (i < element.items.length - 1) {
									html += ` <span style="color: #2c3e50; font-weight: bold;">${element.operator}</span> `;
								}
								return html;
							}).join('');
							return `<span style="border: 2px dashed ${rule.color}; padding: 5px 10px; border-radius: 5px; background: rgba(52, 152, 219, 0.05);">${groupContent}</span>`;
						}
					}).join(' ');
				} else if (rule.actions) {
					// Ancienne structure (compatibilité)
					sequenceHtml = rule.actions.map((a, i) => `<span style="color: ${rule.color};">${i + 1}. ${a}</span>`).join(' → ');
				}

				// Compter le nombre total d'actions
				let totalActions = 0;
				if (rule.sequence) {
					totalActions = rule.sequence.filter(g => typeof g === "object").reduce((sum, g) => sum + g.items.length, 0);
				} else if (rule.actions) {
					totalActions = rule.actions.length;
				}

				return `
				<div style="background: ${rule.isActive ? 'linear-gradient(135deg, #f8f9fa, #e9ecef)' : '#f1f3f5'};
							border-left: 5px solid ${rule.color};
							padding: 15px;
							margin-bottom: 15px;
							opacity: ${rule.isActive ? '1' : '0.6'};">
					<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
						<div>
							<h4 style="margin: 0 0 5px 0; color: #2c3e50; font-size: 1.1rem;">
								${rule.isActive ? '✅' : '⭕'} ${rule.name}
							</h4>
							<span style="background: ${rule.color}; color: white; padding: 3px 10px; border-radius: 5px; font-size: 0.8rem; font-weight: 600;">
								${rule.isPositive ? 'POSITIVE' : 'NÉGATIVE'}
							</span>
						</div>
						<div style="display: flex; gap: 8px;">
							<button onclick="toggleRule('${rule.id}')"
									style="background: ${rule.isActive ? '#f39c12' : '#2ecc71'}; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 0.85rem;">
								${rule.isActive ? '⏸️ Désactiver' : '▶️ Activer'}
							</button>
							<button onclick="deleteRule('${rule.id}')"
									style="background: #e74c3c; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 0.85rem;">
								🗑️ Supprimer
							</button>
						</div>
					</div>
					<div style="background: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 0.9rem;">
						<strong>Séquence :</strong> ${sequenceHtml}
					</div>
					<div style="margin-top: 10px; color: #7f8c8d; font-size: 0.85rem; display: flex; align-items: center; gap: 15px;">
						<span>${totalActions} actions</span>
						<span style="display: flex; align-items: center; gap: 8px;">
							<strong>Tolérance :</strong>
							<input type="number" id="tolerance_${rule.id}" value="${rule.tolerance !== undefined ? rule.tolerance : 0}"
								   min="0" max="10" onchange="updateRuleTolerance('${rule.id}', this.value)"
								   style="width: 50px; padding: 4px 8px; border: 2px solid #e8e8e8; border-radius: 5px; text-align: center;">
						</span>
						<span>Détections : <span id="detection_count_${rule.id}" style="font-weight: ${detectionCount > 0 ? 'bold' : 'normal'}; color: ${detectionCount > 0 ? rule.color : '#7f8c8d'};">${detectionCount}</span></span>
					</div>
				</div>
				`;
			}).join('');
		}

		function updateRulesToggleBanner() {
			const container = document.getElementById('rulesToggleContainer');
			const toggleBtn = document.getElementById('toggleAllRulesBtn');

			if (businessRules.length === 0) {
				container.innerHTML = '<span style="color: #7f8c8d; font-style: italic;">Aucune règle créée</span>';
				toggleBtn.disabled = true;
				toggleBtn.style.opacity = '0.5';
				return;
			}

			toggleBtn.disabled = false;
			toggleBtn.style.opacity = '1';

			const allActive = businessRules.every(r => r.isActive);
			toggleBtn.textContent = allActive ? '⭕ Tout désactiver' : '✅ Tout activer';

			container.innerHTML = businessRules.map(rule => `
				<button onclick="toggleRule('${rule.id}')"
						style="background: ${rule.isActive ? rule.color : '#95a5a6'};
							   color: white;
							   border: none;
							   padding: 6px 12px;
							   border-radius: 5px;
							   cursor: pointer;
							   font-size: 0.85rem;
							   transition: all 0.2s ease;">
					${rule.isActive ? '✅' : '⭕'} ${rule.name}
				</button>
			`).join('');
		}

		function updateRuleTolerance(ruleId, newTolerance) {
			const rule = businessRules.find(r => r.id === ruleId);
			if (rule) {
				const oldTolerance = rule.tolerance;
				rule.tolerance = parseInt(newTolerance) || 0;

				// Ne recalculer que si la tolérance a vraiment changé
				if (oldTolerance !== rule.tolerance) {
					console.log(`🔧 Tolérance mise à jour pour règle "${rule.name}": ${oldTolerance} → ${rule.tolerance}`);

					// Recalculer les détections avec la nouvelle tolérance
					detectRuleMatches();

					// Mettre à jour seulement le compteur de détections sans recharger tout l'affichage
					updateRulesListDetectionCounts();
					updateDashboard();
				}
			}
		}

		function updateRulesListDetectionCounts() {
			// Mettre à jour uniquement les compteurs de détections sans recharger l'UI complète
			businessRules.forEach(rule => {
				const detectionCount = ruleMatches.filter(m => m.ruleId === rule.id).length;
				const detectionSpan = document.querySelector(`#detection_count_${rule.id}`);
				if (detectionSpan) {
					detectionSpan.textContent = detectionCount;
					detectionSpan.style.fontWeight = detectionCount > 0 ? 'bold' : 'normal';
					detectionSpan.style.color = detectionCount > 0 ? rule.color : '#7f8c8d';
				}
			});
		}

		function toggleRule(ruleId) {
			const rule = businessRules.find(r => r.id === ruleId);
			if (rule) {
				rule.isActive = !rule.isActive;
				detectRuleMatches();
				updateRulesList();
				updateRulesToggleBanner();
				applyFilters();
			}
		}

		function toggleAllRules() {
			const allActive = businessRules.every(r => r.isActive);
			businessRules.forEach(r => r.isActive = !allActive);
			detectRuleMatches();
			updateRulesList();
			updateRulesToggleBanner();
			applyFilters();
		}

		function deleteRule(ruleId) {
			if (!confirm('Êtes-vous sûr de vouloir supprimer cette règle ?')) return;

			// Libérer la couleur de la règle supprimée
			const rule = businessRules.find(r => r.id === ruleId);
			if (rule && rule.color) {
				releaseColor(rule.color);
			}

			businessRules = businessRules.filter(r => r.id !== ruleId);
			ruleMatches = ruleMatches.filter(m => m.ruleId !== ruleId);

			updateRulesList();
			updateRulesToggleBanner();
			applyFilters();
		}

		function detectRuleMatches() {
			ruleMatches = [];

			if (filteredData.length === 0 || businessRules.length === 0) {
				console.log('⚠️ Pas de détection: filteredData =', filteredData.length, ', businessRules =', businessRules.length);
				return;
			}

			const sortedData = [...filteredData].sort((a, b) =>
				parseInt(a.Position || 0) - parseInt(b.Position || 0)
			);

			const dataByMatch = {};
			sortedData.forEach(d => {
				const matchKey = `${d.Date}|${d.Adversaire}`;
				if (!dataByMatch[matchKey]) {
					dataByMatch[matchKey] = [];
				}
				dataByMatch[matchKey].push(d);
			});

			console.log(`🔍 Recherche dans ${Object.keys(dataByMatch).length} match(s) avec ${businessRules.filter(r => r.isActive).length} règle(s) active(s)`);

			Object.entries(dataByMatch).forEach(([matchKey, matchData]) => {
				const [date, adversaire] = matchKey.split('|');

				businessRules.filter(r => r.isActive).forEach(rule => {
					// Nouvelle détection avec support des groupes
					if (rule.sequence) {
						detectSequenceMatches(rule, matchData, date, adversaire);
					} else if (rule.actions) {
						// Ancienne méthode (compatibilité)
						detectSimpleSequence(rule, matchData, date, adversaire);
					}
				});
			});

			console.log(`🎯 ${ruleMatches.length} séquences détectées au total`);
		}

		function detectSimpleSequence(rule, matchData, date, adversaire) {
			const ruleLength = rule.actions.length;

			for (let i = 0; i <= matchData.length - ruleLength; i++) {
				const sequence = matchData.slice(i, i + ruleLength);

				const matches = sequence.every((item, idx) =>
					item.Action === rule.actions[idx]
				);

				if (matches) {
					console.log(`✅ Séquence trouvée pour règle "${rule.name}":`, sequence.map(s => s.Action));
					ruleMatches.push({
						ruleId: rule.id,
						ruleName: rule.name,
						isPositive: rule.isPositive,
						players: [...new Set(sequence.map(s => s.Joueur))],
						startPosition: parseInt(sequence[0].Position || 0),
						endPosition: parseInt(sequence[ruleLength - 1].Position || 0),
						quarter: sequence[0]['Période'],
						date: date,
						adversaire: adversaire,
						sequence: sequence.map(s => ({
							action: s.Action,
							player: s.Joueur,
							time: s.Temps
						}))
					});
				}
			}
		}

		function detectSequenceMatches(rule, matchData, date, adversaire) {
			// Vérifier si la règle est composée uniquement de groupes à 1 élément reliés par OU
			const isSimpleOrRule = isAllGroupsLinkedByOr(rule.sequence);

			if (isSimpleOrRule) {
				// Cas simple : compter chaque occurrence individuelle
				console.log(`📊 Règle "${rule.name}" : comptage simple (tous groupes reliés par OU)`);
				detectSimpleOrOccurrences(rule, matchData, date, adversaire);
			} else {
				// Cas complexe : chercher des séquences chronologiques
				console.log(`🔍 Règle "${rule.name}" : recherche de séquences chronologiques (tolérance: ${rule.tolerance || 0})`);
				for (let startIdx = 0; startIdx < matchData.length; startIdx++) {
					const result = tryMatchSequenceAt(rule.sequence, matchData, startIdx, rule.tolerance || 0);

					if (result.matched) {
						console.log(`✅ Séquence avec groupes trouvée pour règle "${rule.name}":`, result.matchedActions);

						ruleMatches.push({
							ruleId: rule.id,
							ruleName: rule.name,
							isPositive: rule.isPositive,
							players: [...new Set(result.matchedItems.map(s => s.Joueur))],
							startPosition: parseInt(result.matchedItems[0].Position || 0),
							endPosition: parseInt(result.matchedItems[result.matchedItems.length - 1].Position || 0),
							quarter: result.matchedItems[0]['Période'],
							date: date,
							adversaire: adversaire,
							sequence: result.matchedItems.map(s => ({
								action: s.Action,
								player: s.Joueur,
								time: s.Temps
							}))
						});
					}
				}
			}
		}

		function isAllGroupsLinkedByOr(sequence) {
			// Vérifier si tous les opérateurs entre groupes sont des OU
			// et qu'il n'y a pas d'opérateurs ET dans les groupes
			let hasEtOperator = false;

			for (let i = 0; i < sequence.length; i++) {
				const element = sequence[i];

				if (typeof element === "string") {
					// Opérateur entre groupes
					if (element === "ET") {
						hasEtOperator = true;
						break;
					}
				} else if (element.type === "group") {
					// Vérifier l'opérateur interne du groupe
					if (element.items.length > 1 && element.operator === "ET") {
						hasEtOperator = true;
						break;
					}
				}
			}

			return !hasEtOperator;
		}

		function detectSimpleOrOccurrences(rule, matchData, date, adversaire) {
			// Collecter toutes les actions possibles de tous les groupes
			const possibleActions = [];
			rule.sequence.forEach(element => {
				if (element.type === "group") {
					possibleActions.push(...element.items);
				}
			});

			// Parcourir les données et compter chaque occurrence
			matchData.forEach(item => {
				if (possibleActions.includes(item.Action)) {
					ruleMatches.push({
						ruleId: rule.id,
						ruleName: rule.name,
						isPositive: rule.isPositive,
						players: [item.Joueur],
						startPosition: parseInt(item.Position || 0),
						endPosition: parseInt(item.Position || 0),
						quarter: item['Période'],
						date: date,
						adversaire: adversaire,
						sequence: [{
							action: item.Action,
							player: item.Joueur,
							time: item.Temps
						}]
					});
				}
			});
		}

		function tryMatchSequenceAt(ruleSequence, matchData, startIdx, tolerance) {
			let currentIdx = startIdx;
			let matchedItems = [];
			let matchedActions = [];
			let previousGroupResult = null;

			for (let seqIdx = 0; seqIdx < ruleSequence.length; seqIdx++) {
				const element = ruleSequence[seqIdx];

				if (typeof element === "string") {
					// C'est un opérateur entre groupes (ET ou OU)
					// On l'ignore pour le moment, il sera évalué avec le groupe suivant
					continue;
				}

				if (element.type === "group") {
					// Récupérer l'opérateur qui précède ce groupe (si existe)
					const operatorBefore = seqIdx > 0 && typeof ruleSequence[seqIdx - 1] === "string"
						? ruleSequence[seqIdx - 1]
						: "ET";

					// Essayer de matcher ce groupe avec la tolérance
					const groupResult = tryMatchGroup(element, matchData, currentIdx, tolerance);

					if (groupResult.matched) {
						// Le groupe a matché
						if (operatorBefore === "ET" || previousGroupResult === null) {
							// Pour ET : on continue la séquence
							matchedItems.push(...groupResult.matchedItems);
							matchedActions.push(...groupResult.matchedActions);
							currentIdx = groupResult.nextIdx;
							previousGroupResult = true;
						} else if (operatorBefore === "OU" && previousGroupResult === false) {
							// Pour OU : si le groupe précédent n'avait pas matché, ce groupe sauve la règle
							matchedItems.push(...groupResult.matchedItems);
							matchedActions.push(...groupResult.matchedActions);
							currentIdx = groupResult.nextIdx;
							previousGroupResult = true;
						}
					} else {
						// Le groupe n'a pas matché
						if (operatorBefore === "ET") {
							// Pour ET : échec total
							return { matched: false };
						} else if (operatorBefore === "OU") {
							// Pour OU : on peut continuer si le groupe précédent avait matché
							if (previousGroupResult === false) {
								return { matched: false };
							}
							// Sinon on continue sans ajouter ce groupe
						}
						previousGroupResult = false;
					}
				}
			}

			// Vérifier que tous les groupes obligatoires ont été matchés
			return {
				matched: matchedItems.length > 0,
				matchedItems: matchedItems,
				matchedActions: matchedActions
			};
		}

		function tryMatchGroup(group, matchData, startIdx, tolerance) {
			const groupItems = group.items;
			const groupOperator = group.operator || "ET";

			if (groupOperator === "ET") {
				// Tous les éléments doivent être matchés dans l'ordre avec tolérance
				let currentIdx = startIdx;
				let matchedItems = [];
				let matchedActions = [];

				for (let i = 0; i < groupItems.length; i++) {
					const action = groupItems[i];

					// Chercher cette action dans la fenêtre de tolérance
					let found = false;
					const maxSearchIdx = Math.min(currentIdx + tolerance + 1, matchData.length);

					for (let j = currentIdx; j < maxSearchIdx; j++) {
						if (matchData[j].Action === action) {
							matchedItems.push(matchData[j]);
							matchedActions.push(action);
							currentIdx = j + 1;
							found = true;
							break;
						}
					}

					if (!found) {
						return { matched: false };
					}
				}

				return {
					matched: true,
					matchedItems: matchedItems,
					matchedActions: matchedActions,
					nextIdx: currentIdx
				};

			} else if (groupOperator === "OU") {
				// Au moins un des éléments doit être matché (tolérance ne s'applique pas au OU)
				for (let j = startIdx; j < matchData.length; j++) {
					if (groupItems.includes(matchData[j].Action)) {
						return {
							matched: true,
							matchedItems: [matchData[j]],
							matchedActions: [matchData[j].Action],
							nextIdx: j + 1
						};
					}
				}

				return { matched: false };
			}

			return { matched: false };
		}

        // ============================================
        // INITIALISATION
        // ============================================

        window.onload = function() {
            // Initialiser les couleurs utilisées par les règles par défaut
            usedColors.add('#2c5aa0');
            usedColors.add('#dc2626');

            initializeEmptyDashboard();
            loadDataSourceConfig();
        };

        // Gestion des fichiers
        function handleFileUpload(event) {
            const file = event.target.files[0];
            if (file && file.type === 'text/csv') {
                const reader = new FileReader();
                reader.onload = function(e) {
                    parseCSVData(e.target.result);
                };
                reader.readAsText(file);
            }
        }

        function handleFileDrop(event) {
            event.preventDefault();
            event.currentTarget.classList.remove('dragover');
            const file = event.dataTransfer.files[0];
            if (file && file.type === 'text/csv') {
                const reader = new FileReader();
                reader.onload = function(e) {
                    parseCSVData(e.target.result);
                };
                reader.readAsText(file);
            }
        }

        function handleDragOver(event) {
            event.preventDefault();
            event.currentTarget.classList.add('dragover');
        }

        function handleDragLeave(event) {
            event.currentTarget.classList.remove('dragover');
        }

        function initializeEmptyDashboard() {
            basketballData = [];
            filteredData = [];

            document.getElementById('dateFilter').innerHTML = '<option value="">Toutes les dates</option>';
            document.getElementById('adversaireFilter').innerHTML = '<option value="">Tous les adversaires</option>';
            document.getElementById('quartFilter').innerHTML = '<option value="">Toutes les périodes</option>';
            document.getElementById('playersCheckboxes').innerHTML = '<p style="color: #7f8c8d; font-style: italic;">Aucun joueur disponible</p>';
            document.getElementById('actionsCheckboxes').innerHTML = '<p style="color: #7f8c8d; font-style: italic;">Aucune action disponible</p>';

            updateStats();
            initializeEmptyCharts();

            document.getElementById('positiveActionsConfig').innerHTML = '<p style="color: #7f8c8d; font-style: italic;">Aucune action disponible</p>';
            document.getElementById('negativeActionsConfig').innerHTML = '<p style="color: #7f8c8d; font-style: italic;">Aucune action disponible</p>';

            customPositiveActions = [];
            customNegativeActions = [];
            selectedStats = [];
            document.getElementById('statsFilterContainer').innerHTML = '';
            document.getElementById('playersGrid').innerHTML = '<div class="no-data">Importez un fichier CSV pour commencer l\'analyse</div>';
        }

        function parseCSVData(csvText) {
            const lines = csvText.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());

            basketballData = lines.slice(1).map((line, index) => {
                const values = line.split(',').map(v => v.trim());
                const obj = {};
                headers.forEach((header, idx) => {
                    obj[header] = values[idx];
                });
                // Ajouter Position seulement si elle n'existe pas déjà dans le CSV
                if (!obj.Position && obj.Position !== 0) {
                    obj.Position = index;
                }
                return obj;
            });

            filteredData = [...basketballData];
            initializeFilters();
            updateDashboard();
        }

        function initializeFilters() {
            const dates = [...new Set(basketballData.map(d => d.Date))].sort();
            const dateSelect = document.getElementById('dateFilter');
            dateSelect.innerHTML = '<option value="">Toutes les dates</option>';
            dates.forEach(date => {
                dateSelect.innerHTML += `<option value="${date}">${new Date(date).toLocaleDateString('fr-FR')}</option>`;
            });

            const adversaires = [...new Set(basketballData.map(d => d.Adversaire))].sort();
            const adversaireSelect = document.getElementById('adversaireFilter');
            adversaireSelect.innerHTML = '<option value="">Tous les adversaires</option>';
            adversaires.forEach(adv => {
                adversaireSelect.innerHTML += `<option value="${adv}">${adv}</option>`;
            });

            const quarters = [...new Set(basketballData.map(d => d['Période']))].sort();
            const quartSelect = document.getElementById('quartFilter');
            quartSelect.innerHTML = '<option value="">Toutes les périodes</option>';
            quarters.forEach(q => {
                quartSelect.innerHTML += `<option value="${q}">${q}</option>`;
            });

            const players = [...new Set(basketballData.map(d => d.Joueur))].sort();
            const playersContainer = document.getElementById('playersCheckboxes');
            playersContainer.innerHTML = '';
            players.forEach(player => {
                const div = document.createElement('div');
                div.className = 'checkbox-item active';
                div.innerHTML = `<input type="checkbox" id="player-${player}" checked onchange="applyFilters()"> ${player}`;
                div.onclick = function() {
                    const checkbox = div.querySelector('input');
                    checkbox.checked = !checkbox.checked;
                    div.classList.toggle('active', checkbox.checked);
                    applyFilters();
                };
                playersContainer.appendChild(div);
            });

            const actions = [...new Set(basketballData.map(d => d.Action))].sort();
            const actionsContainer = document.getElementById('actionsCheckboxes');
            actionsContainer.innerHTML = '';
            actions.forEach(action => {
                const div = document.createElement('div');
                div.className = 'checkbox-item active';
                div.innerHTML = `<input type="checkbox" id="action-${action}" checked onchange="applyFilters()"> ${action}`;
                div.onclick = function() {
                    const checkbox = div.querySelector('input');
                    checkbox.checked = !checkbox.checked;
                    div.classList.toggle('active', checkbox.checked);
                    applyFilters();
                };
                actionsContainer.appendChild(div);
            });

            initializeCategoryConfiguration();
			initializeRuleActionsSelector();
			initializeRuleGroups();
            populateStatsFilters();

            // Initialiser les règles métier au chargement
            updateRulesList();
            updateRulesToggleBanner();
            detectRuleMatches();
        }

        function initializeCategoryConfiguration() {
            if (basketballData.length === 0) return;

            const allActions = [...new Set(basketballData.map(d => d.Action))].sort();
            updateCategoryConfiguration(allActions);
        }

        function updateCategoryConfiguration(allActions) {
            const positiveContainer = document.getElementById('positiveActionsConfig');
            const negativeContainer = document.getElementById('negativeActionsConfig');

            positiveContainer.innerHTML = '';
            negativeContainer.innerHTML = '';

            const existingUncategorized = document.querySelector('.uncategorized-section');
            if (existingUncategorized) {
                existingUncategorized.remove();
            }

            if (customPositiveActions.length === 0 && customNegativeActions.length === 0) {
                customPositiveActions = ['1 Point','2 Points', '3 Points', 'Passes décisive', 'Rebond', 'Interceptions', 'Rebond def.', 'Rebond off.']
                    .filter(action => allActions.includes(action));
                customNegativeActions = ['Fautes', 'Perte de balle', 'Panier raté','1 Point raté','2 Points raté','3 Points raté']
                    .filter(action => allActions.includes(action));
            }

            customPositiveActions.forEach(action => {
                const div = createCategoryItem(action, 'positive');
                positiveContainer.appendChild(div);
            });

            customNegativeActions.forEach(action => {
                const div = createCategoryItem(action, 'negative');
                negativeContainer.appendChild(div);
            });

            const uncategorizedActions = allActions.filter(action =>
                !customPositiveActions.includes(action) && !customNegativeActions.includes(action)
            );

            const uncategorizedSection = document.createElement('div');
            uncategorizedSection.className = 'uncategorized-section';

            const uncategorizedTitle = document.createElement('p');
            uncategorizedTitle.style.cssText = 'color: #7f8c8d; margin-bottom: 15px; font-weight: 600; font-size: 1.1rem;';
            uncategorizedTitle.textContent = 'Actions non catégorisées :';
            uncategorizedSection.appendChild(uncategorizedTitle);

            const uncategorizedContainer = document.createElement('div');
            uncategorizedContainer.className = 'uncategorized-actions';
            uncategorizedContainer.style.cssText = `
                min-height: 60px;
                padding: 15px;
                background: rgba(248, 249, 250, 0.8);
                border: 2px dashed #bdc3c7;
                border-radius: 8px;
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: flex-start;
                width: 100%;
            `;

            if (uncategorizedActions.length > 0) {
                uncategorizedActions.forEach(action => {
                    const div = createCategoryItem(action, 'uncategorized');
                    uncategorizedContainer.appendChild(div);
                });
            } else {
                const messageDiv = document.createElement('div');
                messageDiv.style.cssText = `
                    width: 100%;
                    text-align: center;
                    color: #27ae60;
                    font-style: italic;
                    font-weight: 500;
                    padding: 20px;
                `;
                messageDiv.textContent = 'Toutes les actions sont catégorisées';
                uncategorizedContainer.appendChild(messageDiv);
            }

            uncategorizedSection.appendChild(uncategorizedContainer);

            const configSection = positiveContainer.closest('.filters-section');
            configSection.appendChild(uncategorizedSection);

            makeDroppable(positiveContainer, 'positive');
            makeDroppable(negativeContainer, 'negative');
            makeDroppable(uncategorizedContainer, 'uncategorized');
        }

        function createCategoryItem(action, category) {
            const div = document.createElement('div');
            div.className = `category-config-item ${category}`;
            div.draggable = true;
            div.dataset.action = action;

            if (category === 'uncategorized') {
                div.style.cssText += `
                    background: #ffffff;
                    border: 1px solid #dee2e6;
                    color: #6c757d;
                `;
            }

            div.innerHTML = `
                <span>${action}</span>
                ${category !== 'uncategorized' ? '<button class="remove-from-category" onclick="removeFromCategory(this)">×</button>' : ''}
            `;

            div.addEventListener('dragstart', function(e) {
                e.dataTransfer.setData('text/plain', action);
                div.classList.add('dragging');
            });

            div.addEventListener('dragend', function(e) {
                div.classList.remove('dragging');
            });

            return div;
        }

        function makeDroppable(container, category) {
            container.addEventListener('dragover', function(e) {
                e.preventDefault();
                if (category !== 'uncategorized') {
                    container.classList.add('drag-over');
                }
            });

            container.addEventListener('dragleave', function(e) {
                if (category !== 'uncategorized') {
                    container.classList.remove('drag-over');
                }
            });

            container.addEventListener('drop', function(e) {
                e.preventDefault();
                const action = e.dataTransfer.getData('text/plain');
                if (category !== 'uncategorized') {
                    addToCategory(action, category);
                    container.classList.remove('drag-over');
                }
            });
        }

        function addToCategory(action, category) {
            customPositiveActions = customPositiveActions.filter(a => a !== action);
            customNegativeActions = customNegativeActions.filter(a => a !== action);

            if (category === 'positive') {
                customPositiveActions.push(action);
            } else if (category === 'negative') {
                customNegativeActions.push(action);
            }

            const allActions = [...new Set(basketballData.map(d => d.Action))].sort();
            updateCategoryConfiguration(allActions);
            updateDashboard();
        }

        function removeFromCategory(button) {
            const action = button.parentElement.dataset.action;
            customPositiveActions = customPositiveActions.filter(a => a !== action);
            customNegativeActions = customNegativeActions.filter(a => a !== action);

            const allActions = [...new Set(basketballData.map(d => d.Action))].sort();
            updateCategoryConfiguration(allActions);
            updateDashboard();
        }

        function resetCategorization() {
            customPositiveActions = [];
            customNegativeActions = [];

            if (basketballData.length > 0) {
                const allActions = [...new Set(basketballData.map(d => d.Action))].sort();
                updateCategoryConfiguration(allActions);
                updateDashboard();
            }
        }

        function applyFilters() {
            const dateFilter = document.getElementById('dateFilter').value;
            const adversaireFilter = document.getElementById('adversaireFilter').value;
            const quartFilter = document.getElementById('quartFilter').value;

            const selectedPlayers = Array.from(document.querySelectorAll('#playersCheckboxes input:checked'))
                .map(checkbox => checkbox.id.replace('player-', ''));

            const selectedActions = Array.from(document.querySelectorAll('#actionsCheckboxes input:checked'))
                .map(checkbox => checkbox.id.replace('action-', ''));

            filteredData = basketballData.filter(d => {
                return (!dateFilter || d.Date === dateFilter) &&
                       (!adversaireFilter || d.Adversaire === adversaireFilter) &&
                       (!quartFilter || d['Période'] === quartFilter) &&
                       selectedPlayers.includes(d.Joueur) &&
                       selectedActions.includes(d.Action);
            });

            detectRuleMatches();
            updateDashboard();
        }

        function resetAllFilters() {
            document.getElementById('dateFilter').value = '';
            document.getElementById('adversaireFilter').value = '';
            document.getElementById('quartFilter').value = '';

            document.querySelectorAll('#playersCheckboxes .checkbox-item').forEach(item => {
                item.querySelector('input').checked = true;
                item.classList.add('active');
            });

            document.querySelectorAll('#actionsCheckboxes .checkbox-item').forEach(item => {
                item.querySelector('input').checked = true;
                item.classList.add('active');
            });

            filteredData = [...basketballData];
            detectRuleMatches();
            updateDashboard();
        }

        function categorizeActions() {
            const positiveActions = customPositiveActions.length > 0 ? customPositiveActions :
                ['1 Point', '2 Points', '3 Points', 'Passes décisive', 'Rebond', 'Interceptions', 'Rebond def.', 'Rebond off.'];
            const negativeActions = customNegativeActions.length > 0 ? customNegativeActions :
                ['Fautes', 'Perte de balle', 'Panier raté','1 Point raté','2 Points raté','3 Points raté'];

            return { positiveActions, negativeActions };
        }

        function updateStats() {
            const { positiveActions, negativeActions } = categorizeActions();

            const totalActions = filteredData.length;
            const totalPoints = filteredData.filter(d =>
                d.Action === '2 Points' || d.Action === '3 Points' || d.Action === '1 Point'
            ).reduce((sum, d) => sum + parseInt(d.Action.split(' ')[0]), 0);

            const positiveCount = filteredData.filter(d => positiveActions.includes(d.Action)).length;
            const negativeCount = filteredData.filter(d => negativeActions.includes(d.Action)).length;

            const activePlayers = new Set(filteredData.map(d => d.Joueur)).size;
            const matches = new Set(filteredData.map(d => `${d.Date}-${d.Adversaire}`)).size;

            document.getElementById('totalActions').textContent = totalActions;
            document.getElementById('totalPoints').textContent = totalPoints;
            document.getElementById('positiveActions').textContent = positiveCount;
            document.getElementById('negativeActions').textContent = negativeCount;
            document.getElementById('activePlayersCount').textContent = activePlayers;
            document.getElementById('matchesCount').textContent = matches;
        }

        function initializeEmptyCharts() {
            const chartIds = [
                'playersChart', 'quartersChart', 'actionsChart', 'timelineChart',
                'performanceRankingChart', 'balanceChart', 'actionsByQuarterChart', 'actionsByMatchChart'
            ];

            chartIds.forEach(chartId => {
                const ctx = document.getElementById(chartId).getContext('2d');
                if (charts[chartId]) charts[chartId].destroy();

                charts[chartId] = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Aucune donnée',
                            data: [],
                            backgroundColor: '#e0e0e0'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        }
                    }
                });
            });
        }

        function updateDashboard() {
            updateStats();
            updatePlayersChart();
            updateQuartersChart();
            updateActionsChart();
            updateTimelineChart();
            updatePerformanceRankingChart();
            updateBalanceChart();
            updateActionsByQuarterChart();
            updateActionsByMatchChart();
            updatePlayersGrid();
        }

        // Graphiques (simplifiés pour la taille du fichier)
        function updatePlayersChart() {
            const { positiveActions, negativeActions } = categorizeActions();
            const playerStats = {};

            const players = [...new Set(filteredData.map(d => d.Joueur))];
            players.forEach(player => {
                playerStats[player] = { positive: 0, negative: 0 };
            });

            filteredData.forEach(d => {
                if (positiveActions.includes(d.Action)) {
                    playerStats[d.Joueur].positive++;
                } else if (negativeActions.includes(d.Action)) {
                    playerStats[d.Joueur].negative++;
                }
            });

            const ctx = document.getElementById('playersChart').getContext('2d');
            if (charts.playersChart) charts.playersChart.destroy();

            charts.playersChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: players,
                    datasets: [
                        {
                            label: 'Actions Positives',
                            data: players.map(p => playerStats[p].positive),
                            backgroundColor: '#2c5aa0'
                        },
                        {
                            label: 'Actions Négatives',
                            data: players.map(p => playerStats[p].negative),
                            backgroundColor: '#dc2626'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        function updateQuartersChart() {
            const { positiveActions, negativeActions } = categorizeActions();
            const quarters = [...new Set(filteredData.map(d => d['Période']))].sort();
            const quarterStats = {};

            quarters.forEach(q => {
                quarterStats[q] = { positive: 0, negative: 0 };
            });

            filteredData.forEach(d => {
                if (positiveActions.includes(d.Action)) {
                    quarterStats[d['Période']].positive++;
                } else if (negativeActions.includes(d.Action)) {
                    quarterStats[d['Période']].negative++;
                }
            });

            const ctx = document.getElementById('quartersChart').getContext('2d');
            if (charts.quartersChart) charts.quartersChart.destroy();

            charts.quartersChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: quarters,
                    datasets: [
                        {
                            label: 'Actions Positives',
                            data: quarters.map(q => quarterStats[q].positive),
                            backgroundColor: '#2c5aa0'
                        },
                        {
                            label: 'Actions Négatives',
                            data: quarters.map(q => quarterStats[q].negative),
                            backgroundColor: '#dc2626'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        function updateActionsChart() {
            const actionCounts = {};
            filteredData.forEach(d => {
                actionCounts[d.Action] = (actionCounts[d.Action] || 0) + 1;
            });

            const ctx = document.getElementById('actionsChart').getContext('2d');
            if (charts.actionsChart) charts.actionsChart.destroy();

            charts.actionsChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(actionCounts),
                    datasets: [{
                        data: Object.values(actionCounts),
                        backgroundColor: [
                            '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
                            '#1abc9c', '#34495e', '#e67e22'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        }

        function updateTimelineChart() {
            const { positiveActions, negativeActions } = categorizeActions();
            const quarters = [...new Set(filteredData.map(d => d['Période']))].sort();
            const quarterStats = {};

            quarters.forEach(q => {
                quarterStats[q] = { positive: 0, negative: 0 };
            });

            filteredData.forEach(d => {
                if (positiveActions.includes(d.Action)) {
                    quarterStats[d['Période']].positive++;
                } else if (negativeActions.includes(d.Action)) {
                    quarterStats[d['Période']].negative++;
                }
            });

            const ctx = document.getElementById('timelineChart').getContext('2d');
            if (charts.timelineChart) charts.timelineChart.destroy();

            charts.timelineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: quarters,
                    datasets: [
                        {
                            label: 'Actions Positives',
                            data: quarters.map(q => quarterStats[q].positive),
                            borderColor: '#2c5aa0',
                            backgroundColor: 'rgba(44, 90, 160, 0.1)',
                            fill: true
                        },
                        {
                            label: 'Actions Négatives',
                            data: quarters.map(q => quarterStats[q].negative),
                            borderColor: '#dc2626',
                            backgroundColor: 'rgba(220, 38, 38, 0.1)',
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' }
                    },
                    scales: {
                        y: { beginAtZero: true }
                    }
                }
            });
        }

        function updatePerformanceRankingChart() {
            const { positiveActions, negativeActions } = categorizeActions();
            const playerStats = {};

            const players = [...new Set(filteredData.map(d => d.Joueur))];
            players.forEach(player => {
                playerStats[player] = { positive: 0, negative: 0, performance: 0 };
            });

            filteredData.forEach(d => {
                if (positiveActions.includes(d.Action)) {
                    playerStats[d.Joueur].positive++;
                } else if (negativeActions.includes(d.Action)) {
                    playerStats[d.Joueur].negative++;
                }
            });

            Object.keys(playerStats).forEach(player => {
                playerStats[player].performance = playerStats[player].positive - playerStats[player].negative;
            });

            const sortedPlayers = Object.entries(playerStats)
                .sort((a, b) => b[1].performance - a[1].performance);

            const ctx = document.getElementById('performanceRankingChart').getContext('2d');
            if (charts.performanceRankingChart) charts.performanceRankingChart.destroy();

            const performanceValues = sortedPlayers.map(([, stats]) => stats.performance);
            const maxValue = Math.max(...performanceValues.map(Math.abs), 5);
            const scaledMax = Math.ceil(maxValue * 1.1);

            const backgroundColors = performanceValues.map(value => {
                if (value > 0) return '#166534';
                if (value === 0) return '#000000';
                return '#dc2626';
            });

            const borderColors = performanceValues.map(value => {
                if (value > 0) return '#15803d';
                if (value === 0) return '#374151';
                return '#991b1b';
            });

            charts.performanceRankingChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: sortedPlayers.map(([player]) => player),
                    datasets: [{
                        label: 'Score Performance (Positives - Négatives)',
                        data: performanceValues,
                        backgroundColor: backgroundColors,
                        borderColor: borderColors,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const playerName = context.label;
                                    const stats = playerStats[playerName];
                                    return `${playerName}: ${stats.performance} (${stats.positive} pos. - ${stats.negative} nég.)`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            min: -scaledMax,
                            max: scaledMax,
                            grid: {
                                color: function(context) {
                                    return context.tick.value === 0 ? '#000000' : '#e5e7eb';
                                }
                            }
                        },
                        y: {
                            ticks: {
                                maxRotation: 0
                            }
                        }
                    }
                }
            });
        }

        function updateBalanceChart() {
            const { positiveActions, negativeActions } = categorizeActions();
            const playerStats = {};

            const players = [...new Set(filteredData.map(d => d.Joueur))];
            players.forEach(player => {
                playerStats[player] = { positive: 0, negative: 0 };
            });

            filteredData.forEach(d => {
                if (positiveActions.includes(d.Action)) {
                    playerStats[d.Joueur].positive++;
                } else if (negativeActions.includes(d.Action)) {
                    playerStats[d.Joueur].negative++;
                }
            });

            let balanced = 0;
            let positive = 0;
            let negative = 0;

            Object.values(playerStats).forEach(stats => {
                const performance = stats.positive - stats.negative;
                if (performance > 2) positive++;
                else if (performance < -2) negative++;
                else balanced++;
            });

            const ctx = document.getElementById('balanceChart').getContext('2d');
            if (charts.balanceChart) charts.balanceChart.destroy();

            charts.balanceChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Équilibrés (-2 à +2)', 'Performants (+2)', 'En difficulté (-2)'],
                    datasets: [{
                        data: [balanced, positive, negative],
                        backgroundColor: ['#6b7280', '#166534', '#dc2626'],
                        borderColor: ['#4b5563', '#15803d', '#991b1b'],
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.parsed * 100) / total).toFixed(1);
                                    return `${context.label}: ${context.parsed} joueurs (${percentage}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        function updateActionsByQuarterChart() {
            const allActions = [...new Set(filteredData.map(d => d.Action))].sort();

            // Créer un mapping des règles avec leurs couleurs
            const ruleColorMap = {};
            businessRules.forEach(rule => {
                ruleColorMap[`[RÈGLE] ${rule.name}`] = rule.color;
            });

            // Ajouter les règles métier comme types d'actions
            const ruleActions = businessRules
                .filter(r => ruleMatches.some(m => m.ruleId === r.id))
                .map(r => `[RÈGLE] ${r.name}`);

            const actionTypes = [...allActions, ...ruleActions];
            const quarters = [...new Set(filteredData.map(d => d['Période']))].sort();

            const dataByQuarter = {};
            quarters.forEach(q => {
                dataByQuarter[q] = {};
                actionTypes.forEach(action => {
                    dataByQuarter[q][action] = 0;
                });
            });

            // Compter les actions normales
            filteredData.forEach(d => {
                const quarter = d['Période'];
                const action = d.Action;
                if (dataByQuarter[quarter] && dataByQuarter[quarter][action] !== undefined) {
                    dataByQuarter[quarter][action]++;
                }
            });

            // Ajouter les règles métier détectées par période
            ruleMatches.forEach(match => {
                const quarter = match.quarter;
                const ruleAction = `[RÈGLE] ${match.ruleName}`;

                if (!dataByQuarter[quarter]) {
                    dataByQuarter[quarter] = {};
                    actionTypes.forEach(action => {
                        dataByQuarter[quarter][action] = 0;
                    });
                }

                if (dataByQuarter[quarter][ruleAction] !== undefined) {
                    dataByQuarter[quarter][ruleAction]++;
                }
            });

            const colors = [
                '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
                '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400'
            ];

            const datasets = actionTypes.map((action, idx) => {
                // Utiliser la couleur de la règle si c'est une règle, sinon couleur par défaut
                const isRule = action.startsWith('[RÈGLE]');
                const ruleColor = isRule ? (ruleColorMap[action] || '#8b5cf6') : colors[idx % colors.length];

                return {
                    label: action,
                    data: quarters.map(q => dataByQuarter[q][action] || 0),
                    backgroundColor: ruleColor,
                    borderColor: ruleColor,
                    borderWidth: isRule ? 3 : 1 // Bordure plus épaisse pour les règles
                };
            });

            const ctx = document.getElementById('actionsByQuarterChart').getContext('2d');
            if (charts.actionsByQuarterChart) charts.actionsByQuarterChart.destroy();

            charts.actionsByQuarterChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: quarters,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                boxWidth: 12,
                                font: {
                                    size: 10
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            title: {
                                display: true,
                                text: 'Période'
                            }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Nombre d\'actions'
                            }
                        }
                    }
                }
            });
        }

        function updateActionsByMatchChart() {
            const allActions = [...new Set(filteredData.map(d => d.Action))].sort();

            // Créer un mapping des règles avec leurs couleurs
            const ruleColorMap = {};
            businessRules.forEach(rule => {
                ruleColorMap[`[RÈGLE] ${rule.name}`] = rule.color;
            });

            // Ajouter les règles métier comme types d'actions
            const ruleActions = businessRules
                .filter(r => ruleMatches.some(m => m.ruleId === r.id))
                .map(r => `[RÈGLE] ${r.name}`);

            const actionTypes = [...allActions, ...ruleActions];
            const matches = [...new Set(filteredData.map(d => `${d.Date} vs ${d.Adversaire}`))].sort();

            const dataByMatch = {};
            matches.forEach(match => {
                dataByMatch[match] = {};
                actionTypes.forEach(action => {
                    dataByMatch[match][action] = 0;
                });
            });

            // Compter les actions normales
            filteredData.forEach(d => {
                const matchKey = `${d.Date} vs ${d.Adversaire}`;
                const action = d.Action;
                if (dataByMatch[matchKey] && dataByMatch[matchKey][action] !== undefined) {
                    dataByMatch[matchKey][action]++;
                }
            });

            // Ajouter les règles métier détectées par match
            ruleMatches.forEach(match => {
                const matchKey = `${match.date} vs ${match.adversaire}`;
                const ruleAction = `[RÈGLE] ${match.ruleName}`;

                if (!dataByMatch[matchKey]) {
                    dataByMatch[matchKey] = {};
                    actionTypes.forEach(action => {
                        dataByMatch[matchKey][action] = 0;
                    });
                }

                if (dataByMatch[matchKey][ruleAction] !== undefined) {
                    dataByMatch[matchKey][ruleAction]++;
                }
            });

            const colors = [
                '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
                '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400'
            ];

            const datasets = actionTypes.map((action, idx) => {
                // Utiliser la couleur de la règle si c'est une règle, sinon couleur par défaut
                const isRule = action.startsWith('[RÈGLE]');
                const ruleColor = isRule ? (ruleColorMap[action] || '#8b5cf6') : colors[idx % colors.length];

                return {
                    label: action,
                    data: matches.map(match => dataByMatch[match][action] || 0),
                    backgroundColor: ruleColor,
                    borderColor: ruleColor,
                    borderWidth: isRule ? 3 : 1 // Bordure plus épaisse pour les règles
                };
            });

            const ctx = document.getElementById('actionsByMatchChart').getContext('2d');
            if (charts.actionsByMatchChart) charts.actionsByMatchChart.destroy();

            charts.actionsByMatchChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: matches,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                boxWidth: 12,
                                font: {
                                    size: 10
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            },
                            title: {
                                display: true,
                                text: 'Match'
                            }
                        },
                        y: {
                            stacked: true,
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Nombre d\'actions'
                            }
                        }
                    }
                }
            });
        }

        function updatePlayersGrid() {
            const playersContainer = document.getElementById('playersGrid');
            const playerStats = {};

            // Calculer les stats de manière dynamique
            filteredData.forEach(d => {
                if (!playerStats[d.Joueur]) {
                    playerStats[d.Joueur] = {
                        numero: d.Numéro,
                        totalActions: 0,
                        actions: {} // Compteur pour chaque action
                    };
                }

                playerStats[d.Joueur].totalActions++;

                // Compter chaque action dynamiquement
                const action = d.Action;
                if (!playerStats[d.Joueur].actions[action]) {
                    playerStats[d.Joueur].actions[action] = 0;
                }
                playerStats[d.Joueur].actions[action]++;
            });

            if (Object.keys(playerStats).length === 0) {
                playersContainer.innerHTML = '<div class="no-data">Aucune donnée disponible avec les filtres actuels</div>';
                return;
            }

            const sortedPlayers = Object.entries(playerStats)
                .sort((a, b) => b[1].totalActions - a[1].totalActions);

            playersContainer.innerHTML = sortedPlayers.map(([player, stats]) => {
                // Construire dynamiquement les stats visibles en fonction de selectedStats
                const statsHtml = selectedStats.map(action => {
                    const count = stats.actions[action] || 0;
                    return `
                        <div class="player-stat">
                            <div class="player-stat-value">${count}</div>
                            <div class="player-stat-label">${action}</div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="player-card">
                        <div class="player-header">
                            <div class="player-name">${player}</div>
                            <div class="player-number">#${stats.numero}</div>
                        </div>
                        <div class="player-stats">
                            ${statsHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        function populateStatsFilters() {
            // Extraire toutes les actions uniques du dataset
            const uniqueActions = [...new Set(basketballData.map(d => d.Action))].sort();

            // Initialiser selectedStats avec toutes les actions
            selectedStats = [...uniqueActions];

            // Générer les boutons
            const container = document.getElementById('statsFilterContainer');
            container.innerHTML = uniqueActions.map(action => {
                // Échapper les guillemets pour éviter les problèmes JavaScript
                const escapedAction = action.replace(/'/g, "\\'");
                return `
                    <button class="stat-filter-btn active" data-stat="${action}" onclick="toggleStatFilterByButton(this)">
                        ${action}
                    </button>
                `;
            }).join('');
        }

        function toggleStatFilterByButton(btn) {
            const stat = btn.getAttribute('data-stat');
            toggleStatFilter(stat, btn);
        }

        function toggleStatFilter(stat, btn) {
            if (!btn) {
                btn = document.querySelector(`[data-stat="${stat}"]`);
            }

            if (selectedStats.includes(stat)) {
                // Retirer la stat
                selectedStats = selectedStats.filter(s => s !== stat);
                btn.classList.remove('active');
            } else {
                // Ajouter la stat
                selectedStats.push(stat);
                btn.classList.add('active');
            }

            // Rafraîchir l'affichage des joueurs
            updatePlayersGrid();
        }

        function exportFilteredData() {
            if (filteredData.length === 0) {
                alert('Aucune donnée à exporter avec les filtres actuels.');
                return;
            }

            const csvContent = "data:text/csv;charset=utf-8,"
                + "Date,Adversaire,Joueur,Numéro,Période,Temps,Action\n"
                + filteredData.map(row =>
                    `${row.Date},${row.Adversaire},${row.Joueur},${row.Numéro},${row['Période']},${row.Temps},${row.Action}`
                ).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "analyse_basketball_filtree.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
