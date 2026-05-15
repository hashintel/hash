import { use, useRef, useState } from "react";
import { TbSend } from "react-icons/tb";

import { css, cx } from "@hashintel/ds-helpers/css";
import {
	deploymentPipelineSDCPN,
	probabilisticSatellitesSDCPN,
	productionMachines,
	satellitesSDCPN,
	sirModel,
	supplyChainStochasticSDCPN,
} from "@hashintel/petrinaut-core/examples";

import { ExperimentsContext } from "../../../react/experiments/context";
import { Box } from "../../components/box";
import { IconButton } from "../../components/icon-button";
import { Input } from "../../components/input";
import { Stack } from "../../components/stack";
import { importSDCPN } from "../../file-io/import-sdcpn";
import { exportSDCPN } from "../../file-io/export-sdcpn";
import { calculateGraphLayout } from "../../lib/calculate-graph-layout";
import { EditorContext } from "../../../react/state/editor-context";
import { MutationContext } from "../../../react/state/mutation-context";
import { PortalContainerContext } from "../../../react/state/portal-container-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useSelectionCleanup } from "../../../react/state/use-selection-cleanup";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { exportTikZ } from "../../file-io/export-tikz";
import { AiAssistantIcon } from "../../components/ai-assistant-icon";
import {
	classicNodeDimensions,
	compactNodeDimensions,
} from "../SDCPN/node-dimensions";
import { SDCPNView } from "../SDCPN/sdcpn-view";
import { BottomBar } from "./components/BottomBar/bottom-bar";
import { ImportErrorDialog } from "./components/import-error-dialog";
import { TopBar } from "./components/TopBar/top-bar";
import { BottomPanel } from "./panels/BottomPanel/panel";
import { LeftSideBar } from "./panels/LeftSideBar/panel";
import { PropertiesPanel } from "./panels/PropertiesPanel/panel";
import { SimulateView } from "./panels/SimulateView/simulate-view";
import { AiAssistantPanel } from "./panels/AiAssistant/panel";
import { runAutoLayout } from "./run-auto-layout";

import type { ViewportAction } from "../../types/viewport-action";
import type { PetrinautAiAssistant } from "../../petrinaut";
import type { SDCPN } from "@hashintel/petrinaut-core";

const relativeTimeFormat = new Intl.RelativeTimeFormat("en", {
	numeric: "auto",
});

const formatRelativeTime = (isoTimestamp: string): string => {
	const diffMs = Date.now() - new Date(isoTimestamp).getTime();
	const diffSecs = Math.round(diffMs / 1_000);
	const diffMins = Math.round(diffMs / 60_000);
	const diffHours = Math.round(diffMs / 3_600_000);
	const diffDays = Math.round(diffMs / 86_400_000);

	if (diffSecs < 60) {
		return relativeTimeFormat.format(-diffSecs, "second");
	} else if (diffMins < 60) {
		return relativeTimeFormat.format(-diffMins, "minute");
	} else if (diffHours < 24) {
		return relativeTimeFormat.format(-diffHours, "hour");
	} else if (diffDays < 30) {
		return relativeTimeFormat.format(-diffDays, "day");
	}
	return new Intl.DateTimeFormat("en", {
		month: "short",
		day: "numeric",
	}).format(new Date(isoTimestamp));
};

const rowContainerStyle = css({
	height: "full",
	userSelect: "none",
});

const canvasContainerStyle = css({
	width: "full",
	position: "relative",
	flexGrow: 1,
});

const editorRootStyle = css({
	position: "relative",
	height: "full",
	overflow: "hidden",
	backgroundColor: "neutral.s25",
});

const portalContainerStyle = css({
	position: "absolute",
	top: "0",
	left: "0",
	width: "full",
	height: "full",
	zIndex: "99999",
	pointerEvents: "none",
});

const emptyAiHeroLayerStyle = css({
	position: "absolute",
	inset: "0",
	zIndex: 20,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: "8",
	pointerEvents: "none",
});

const emptyAiHeroStyle = css({
	pointerEvents: "auto",
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	gap: "5",
	width: "[min(560px, calc(100% - 48px))]",
	padding: "[28px]",
	borderRadius: "[24px]",
	borderWidth: "thin",
	borderStyle: "solid",
	borderColor: "blue.a30",
	backgroundColor: "white.a95",
	boxShadow:
		"[0px 20px 60px rgba(15, 23, 42, 0.18), 0px 2px 8px rgba(15, 23, 42, 0.08), inset 0px 1px 0px rgba(255, 255, 255, 0.9)]",
	textAlign: "center",
	userSelect: "text",
	backdropFilter: "[blur(14px)]",
});

const emptyAiHeroIconStyle = css({
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "[56px]",
	height: "[56px]",
	borderRadius: "2xl",
	backgroundColor: "blue.s20",
	boxShadow: "[0px 0px 0px 8px rgba(42, 128, 200, 0.08)]",
	color: "blue.s90",
});

const emptyAiHeroCopyStyle = css({
	display: "flex",
	flexDirection: "column",
	gap: "2",
	maxWidth: "[420px]",
});

const emptyAiHeroTitleStyle = css({
	margin: "0",
	color: "neutral.s110",
	fontFamily: "[Inter Tight, Inter, sans-serif]",
	fontSize: "[24px]",
	fontWeight: "semibold",
	lineHeight: "[30px]",
});

const emptyAiHeroDescriptionStyle = css({
	margin: "0",
	color: "neutral.s80",
	fontSize: "sm",
	fontWeight: "medium",
	lineHeight: "[20px]",
});

const emptyAiHeroFormStyle = css({
	display: "flex",
	alignItems: "center",
	gap: "2",
	width: "full",
	padding: "1.5",
	borderRadius: "[20px]",
	backgroundColor: "neutral.s00",
	boxShadow:
		"[0px 0px 0px 1px rgba(15, 23, 42, 0.08), 0px 12px 28px rgba(15, 23, 42, 0.12)]",
});

const emptyAiHeroInputStyle = css({
	flex: "[1]",
	minWidth: "[0]",
	height: "[48px]",
	borderColor: "[transparent]",
	backgroundColor: "[transparent]",
	boxShadow: "[none]",
	fontSize: "base",
	_hover: {
		borderColor: "[transparent]",
	},
	_focus: {
		borderColor: "[transparent]",
		boxShadow: "[none]",
	},
	_active: {
		borderColor: "[transparent]",
		boxShadow: "[none]",
	},
});

const isEmptySDCPN = (sdcpn: SDCPN) =>
	sdcpn.places.length === 0 &&
	sdcpn.transitions.length === 0 &&
	sdcpn.types.length === 0 &&
	sdcpn.parameters.length === 0 &&
	sdcpn.differentialEquations.length === 0;

const EmptyAiHero = ({
	bottomClearance,
	input,
	onInputChange,
	onSubmit,
}: {
	bottomClearance: number;
	input: string;
	onInputChange: (value: string) => void;
	onSubmit: (message: string) => void;
}) => {
	const canSubmit = input.trim().length > 0;

	return (
		<div className={emptyAiHeroLayerStyle} style={{ bottom: bottomClearance }}>
			<form
				className={emptyAiHeroStyle}
				onSubmit={(event) => {
					event.preventDefault();
					const trimmedInput = input.trim();
					if (!trimmedInput) {
						return;
					}

					onSubmit(trimmedInput);
				}}
			>
				<div className={emptyAiHeroIconStyle}>
					<AiAssistantIcon size={32} />
				</div>
				<div className={emptyAiHeroCopyStyle}>
					<h2 className={emptyAiHeroTitleStyle}>
						Describe the process you want to create
					</h2>
				</div>
				<div className={emptyAiHeroFormStyle}>
					<Input
						autoFocus
						className={emptyAiHeroInputStyle}
						value={input}
						onChange={(event) => onInputChange(event.currentTarget.value)}
						placeholder="e.g. Model an SIR outbreak with recovery"
						aria-label="Describe the process you want to create"
						size="lg"
					/>
					<IconButton
						type="submit"
						size="lg"
						variant="solid"
						colorScheme="brand"
						disabled={!canSubmit}
						aria-label="Send first AI assistant message"
					>
						<TbSend size={18} />
					</IconButton>
				</div>
			</form>
		</div>
	);
};

/**
 * EditorView is responsible for the overall editor UI layout and controls.
 * It relies on sdcpn-store and editor-store for state, and uses SDCPNView for visualization.
 */
export const EditorView = ({
	aiAssistant,
	hideNetManagementControls,
	viewportActions,
}: {
	aiAssistant?: PetrinautAiAssistant;
	hideNetManagementControls: boolean;
	viewportActions?: ViewportAction[];
}) => {
	// Get data from sdcpn-store
	const {
		createNewNet,
		existingNets,
		loadPetriNet,
		petriNetDefinition,
		title,
		setTitle,
	} = use(SDCPNContext);
	const { commitNodePositions } = use(MutationContext);

	// Get editor context
	const {
		globalMode: mode,
		isAiAssistantOpen,
		setGlobalMode,
		editionMode,
		setEditionMode,
		cursorMode,
		setCursorMode,
		clearSelection,
		setSimulateViewMode,
		setAiAssistantOpen,
		isBottomPanelOpen,
		bottomPanelHeight,
	} = use(EditorContext);
	const { setSelectedExperimentId } = use(ExperimentsContext);

	const { compactNodes } = use(UserSettingsContext);
	const dims = compactNodes ? compactNodeDimensions : classicNodeDimensions;
	const [emptyAiPromptInput, setEmptyAiPromptInput] = useState("");
	const [pendingAiAssistantMessage, setPendingAiAssistantMessage] = useState<
		string | null
	>(null);

	async function handleLayout() {
		await runAutoLayout({
			sdcpn: petriNetDefinition,
			dimensions: dims,
			commitNodePositions,
		});
	}

	const [importError, setImportError] = useState<string | null>(null);

	// Clean up stale selections when items are deleted
	useSelectionCleanup();

	function handleCreateEmpty() {
		createNewNet({
			title: "Untitled",
			petriNetDefinition: {
				places: [],
				transitions: [],
				types: [],
				differentialEquations: [],
				parameters: [],
			},
		});
		clearSelection();
	}

	function handleNew() {
		handleCreateEmpty();
	}

	function handleExport() {
		exportSDCPN({ petriNetDefinition, title });
	}

	function handleExportWithoutVisualInfo() {
		exportSDCPN({ petriNetDefinition, title, removeVisualInfo: true });
	}

	function handleExportTikZ() {
		exportTikZ({ petriNetDefinition, title });
	}

	function handleRunningExperimentClick(experimentId: string) {
		setGlobalMode("simulate");
		setSimulateViewMode("experiments");
		setSelectedExperimentId(experimentId);
	}

	async function handleImport() {
		const result = await importSDCPN();
		if (!result) {
			return; // User cancelled file picker
		}

		if (!result.ok) {
			setImportError(result.error);
			return;
		}

		const { sdcpn: loadedSDCPN, hadMissingPositions } = result;
		let sdcpnToLoad = loadedSDCPN;

		// If any nodes were missing positions, run ELK layout BEFORE creating the net.
		// We must do this before createNewNet because after createNewNet triggers a
		// re-render, the mutatePetriNetDefinition closure would be stale.
		if (hadMissingPositions) {
			const positions = await calculateGraphLayout(sdcpnToLoad, dims);

			if (Object.keys(positions).length > 0) {
				sdcpnToLoad = {
					...sdcpnToLoad,
					places: sdcpnToLoad.places.map((place) => {
						const position = positions[place.id];
						return position
							? { ...place, x: position.x, y: position.y }
							: place;
					}),
					transitions: sdcpnToLoad.transitions.map((transition) => {
						const position = positions[transition.id];
						return position
							? { ...transition, x: position.x, y: position.y }
							: transition;
					}),
				};
			}
		}

		createNewNet({
			title: loadedSDCPN.title,
			petriNetDefinition: sdcpnToLoad,
		});
		clearSelection();
	}

	const menuItems = [
		...(!hideNetManagementControls
			? [
					{
						id: "new",
						label: "New",
						onClick: handleNew,
					},
				]
			: []),
		...(!hideNetManagementControls && Object.keys(existingNets).length > 0
			? [
					{
						id: "open",
						label: "Open",
						submenu: existingNets.map((net) => ({
							id: `open-${net.netId}`,
							label: net.title,
							suffix: formatRelativeTime(net.lastUpdated),
							onClick: () => {
								loadPetriNet(net.netId);
								clearSelection();
							},
						})),
					},
				]
			: []),
		{
			id: "export",
			label: "Export",
			submenu: [
				{
					id: "export-json",
					label: "JSON",
					onClick: handleExport,
				},
				{
					id: "export-without-visuals",
					label: "JSON without visual info",
					onClick: handleExportWithoutVisualInfo,
				},
				{
					id: "export-tikz",
					label: "TikZ",
					onClick: handleExportTikZ,
				},
			],
		},
		...(!hideNetManagementControls
			? [
					{
						id: "import",
						label: "Import",
						onClick: handleImport,
					},
				]
			: []),
		{
			id: "layout",
			label: "Layout",
			onClick: handleLayout,
		},
		...(!hideNetManagementControls
			? [
					{
						id: "load-example",
						label: "Load example",
						submenu: [
							{
								id: "load-example-supply-chain-stochastic",
								label: "Probabilistic Supply Chain",
								onClick: () => {
									createNewNet(supplyChainStochasticSDCPN);
									clearSelection();
								},
							},
							{
								id: "load-example-satellites",
								label: "Satellites",
								onClick: () => {
									createNewNet(satellitesSDCPN);
									clearSelection();
								},
							},
							{
								id: "load-example-probabilistic-satellites",
								label: "Probabilistic Satellites Launcher",
								onClick: () => {
									createNewNet(probabilisticSatellitesSDCPN);
									clearSelection();
								},
							},
							{
								id: "load-example-production-machines",
								label: "Production Machines",
								onClick: () => {
									createNewNet(productionMachines);
									clearSelection();
								},
							},
							{
								id: "load-example-sir-model",
								label: "SIR Model",
								onClick: () => {
									createNewNet(sirModel);
									clearSelection();
								},
							},
							{
								id: "load-example-deployment-pipeline",
								label: "Deployment Pipeline",
								onClick: () => {
									createNewNet(deploymentPipelineSDCPN);
									clearSelection();
								},
							},
						],
					},
				]
			: []),
		{
			id: "docs",
			label: "Docs",
			onClick: () => {
				window.open(
					"https://github.com/hashintel/hash/tree/main/libs/%40hashintel/petrinaut/docs",
					"_blank",
					"noopener,noreferrer",
				);
			},
		},
	];

	const portalContainerRef = useRef<HTMLDivElement>(null);
	const showEmptyAiHero =
		aiAssistant !== undefined &&
		!isAiAssistantOpen &&
		isEmptySDCPN(petriNetDefinition);

	return (
		<PortalContainerContext value={portalContainerRef}>
			<Stack className={cx(editorRootStyle, "petrinaut-root")}>
				<div ref={portalContainerRef} className={portalContainerStyle} />

				<ImportErrorDialog
					open={importError !== null}
					onOpenChange={({ open }) => {
						if (!open) {
							setImportError(null);
						}
					}}
					errorMessage={importError ?? ""}
					onCreateEmpty={handleCreateEmpty}
				/>

				{/* Top Bar - always visible */}
				<TopBar
					menuItems={menuItems}
					title={title}
					onTitleChange={setTitle}
					hideNetManagementControls={hideNetManagementControls}
					mode={mode}
					onModeChange={setGlobalMode}
					onRunningExperimentClick={(experiment) =>
						handleRunningExperimentClick(experiment.id)
					}
				/>

				<Stack direction="row" className={rowContainerStyle}>
					{mode === "simulate" ? (
						<SimulateView />
					) : (
						<Box className={canvasContainerStyle}>
							{/* Left Sidebar - Tools and content panels */}
							<LeftSideBar />

							{/* Properties Panel - Right Side */}
							<PropertiesPanel />

							{/* SDCPN Visualization */}
							<SDCPNView viewportActions={viewportActions} />

							{showEmptyAiHero && (
								<EmptyAiHero
									bottomClearance={isBottomPanelOpen ? bottomPanelHeight : 0}
									input={emptyAiPromptInput}
									onInputChange={setEmptyAiPromptInput}
									onSubmit={(message) => {
										setEmptyAiPromptInput("");
										setPendingAiAssistantMessage(message);
										setAiAssistantOpen(true);
									}}
								/>
							)}

							{/* Bottom Panel - Diagnostics, Simulation Settings */}
							<BottomPanel />

							<BottomBar
								mode={mode}
								editionMode={editionMode}
								onEditionModeChange={setEditionMode}
								cursorMode={cursorMode}
								onCursorModeChange={setCursorMode}
								hasAiAssistant={aiAssistant !== undefined}
							/>

							{aiAssistant && (
								<AiAssistantPanel
									aiAssistant={aiAssistant}
									initialMessage={pendingAiAssistantMessage}
									onInitialMessageConsumed={() =>
										setPendingAiAssistantMessage(null)
									}
								/>
							)}
						</Box>
					)}
				</Stack>
			</Stack>
		</PortalContainerContext>
	);
};
