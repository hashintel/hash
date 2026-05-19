import { use, useEffect } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import {
	formatPlaybackSpeed,
	PLAYBACK_SPEEDS,
	PlaybackContext,
	type PlaybackSpeed,
} from "../../../../../react/playback/context";
import { SimulationContext } from "../../../../../react/simulation/context";
import { Button } from "../../../../components/button";
import { NumberInput } from "../../../../components/number-input";
import { Popover } from "../../../../components/popover";
import { ToolbarButton } from "./toolbar-button";

const contentWidthStyle = css({
	width: "[280px]",
});

const logPlaybackControlsDebug = ({
	hypothesisId,
	location,
	message,
	data,
}: {
	hypothesisId: string;
	location: string;
	message: string;
	data: Record<string, unknown>;
}) => {
	// #region agent log
	fetch("http://127.0.0.1:7370/ingest/051d6616-30f1-4a11-bffa-57e53758d60f", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Debug-Session-Id": "699661",
		},
		body: JSON.stringify({
			sessionId: "699661",
			runId: "initial",
			hypothesisId,
			location,
			message,
			data,
			timestamp: Date.now(),
		}),
	}).catch(() => {});
	// #endregion
};

const menuItemStyle = cva({
	base: {
		display: "flex !important",
		alignItems: "center",
		gap: "2",
		width: "[100%]",
		minWidth: "[130px]",
		height: "[28px]",
		paddingX: "2",
		borderRadius: "lg",
		fontSize: "sm",
		fontWeight: "medium",
		color: "neutral.s120",
		backgroundColor: "[transparent]",
		border: "none",
		cursor: "pointer",
		textAlign: "left",
		_hover: {
			backgroundColor: "neutral.s10",
		},
	},
	variants: {
		selected: {
			true: {
				backgroundColor: "blue.s20",
				_hover: {
					backgroundColor: "blue.s20",
				},
			},
		},
		disabled: {
			true: {
				opacity: "[0.4]",
				cursor: "not-allowed",
				_hover: {
					backgroundColor: "[transparent]",
				},
			},
		},
	},
});

const menuItemIconStyle = css({
	fontSize: "sm",
	color: "neutral.s100",
	flexShrink: 0,
});

const menuItemTextStyle = css({
	flex: "[1]",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
});

const checkIconStyle = css({
	color: "blue.s50",
});

const speedGridStyle = css({
	display: "grid",
	gridTemplateColumns: "repeat(4, 1fr)",
	paddingX: "2",
	paddingBottom: "1",
});

const speedButtonStyle = cva({
	base: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: "2",
		minWidth: "0",
		fontSize: "sm",
		fontWeight: "medium",
		color: "neutral.s120",
		backgroundColor: "[transparent]",
		border: "none",
		borderRadius: "lg",
		cursor: "pointer",
		_hover: {
			backgroundColor: "neutral.s10",
		},
	},
	variants: {
		selected: {
			true: {
				backgroundColor: "blue.s20",
				_hover: {
					backgroundColor: "blue.s20",
				},
			},
		},
	},
});

const popoverDividerStyle = css({
	height: "[1px]",
	backgroundColor: "[transparent]",
	marginTop: "1",
});

const maxTimeInputStyle = css({
	width: "[60px]",
	textAlign: "right",
	flexShrink: 0,
	fontVariantNumeric: "tabular-nums",
});

// Split speeds into two rows of 4
const speedRows: PlaybackSpeed[][] = [
	PLAYBACK_SPEEDS.slice(0, 4),
	PLAYBACK_SPEEDS.slice(4),
];

export const PlaybackSettingsMenu = () => {
	const {
		state: simulationState,
		maxTime,
		setMaxTime,
	} = use(SimulationContext);

	const {
		playbackSpeed,
		playMode,
		isViewOnlyAvailable,
		isComputeAvailable,
		setPlaybackSpeed,
		setPlayMode,
	} = use(PlaybackContext);

	const hasSimulation = simulationState !== "NotRun";

	// Derive stopping condition from maxTime
	const stoppingCondition: "indefinitely" | "fixed" =
		maxTime === null ? "indefinitely" : "fixed";

	useEffect(() => {
		logPlaybackControlsDebug({
			hypothesisId: "C,E",
			location: "playback-settings-menu.tsx:state-effect",
			message: "Playback settings state observed",
			data: {
				simulationState,
				maxTime,
				stoppingCondition,
				playbackSpeed,
				playMode,
				isViewOnlyAvailable,
				isComputeAvailable,
			},
		});
	}, [
		isComputeAvailable,
		isViewOnlyAvailable,
		maxTime,
		playbackSpeed,
		playMode,
		simulationState,
		stoppingCondition,
	]);

	useEffect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Element | null;
			const elementAtPoint = document.elementFromPoint(
				event.clientX,
				event.clientY,
			);
			const popoverPositioner = document.querySelector(
				'[data-scope="popover"][data-part="positioner"]',
			);
			const popoverContent = document.querySelector(
				'[data-scope="popover"][data-part="content"]',
			);

			logPlaybackControlsDebug({
				hypothesisId: "A,B,D",
				location: "playback-settings-menu.tsx:document-pointerdown",
				message: "Document pointerdown captured",
				data: {
					clientX: event.clientX,
					clientY: event.clientY,
					targetTag: target?.tagName,
					targetText: target?.textContent?.trim().slice(0, 80),
					targetAriaLabel: target?.getAttribute("aria-label"),
					elementAtPointTag: elementAtPoint?.tagName,
					elementAtPointText: elementAtPoint?.textContent?.trim().slice(0, 80),
					elementAtPointAriaLabel: elementAtPoint?.getAttribute("aria-label"),
					popoverPositionerPointerEvents: popoverPositioner
						? getComputedStyle(popoverPositioner).pointerEvents
						: null,
					popoverContentPointerEvents: popoverContent
						? getComputedStyle(popoverContent).pointerEvents
						: null,
					isInsidePopoverContent:
						!!popoverContent && !!target && popoverContent.contains(target),
				},
			});
		};

		document.addEventListener("pointerdown", handlePointerDown, {
			capture: true,
		});

		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, {
				capture: true,
			});
		};
	}, []);

	const handleStoppingConditionChange = (
		condition: "indefinitely" | "fixed",
	) => {
		logPlaybackControlsDebug({
			hypothesisId: "C,E",
			location: "playback-settings-menu.tsx:handleStoppingConditionChange",
			message: "Stopping condition click handler invoked",
			data: {
				requestedCondition: condition,
				hasSimulation,
				currentMaxTime: maxTime,
			},
		});

		if (condition === "indefinitely") {
			setMaxTime(null);
		} else {
			// Set default of 10 seconds when switching to fixed time
			setMaxTime(10);
		}
	};

	return (
		<Popover.Root
			positioning={{ placement: "top", gutter: 8 }}
			lazyMount
			unmountOnExit
			onOpenChange={(details) => {
				logPlaybackControlsDebug({
					hypothesisId: "A,D",
					location: "playback-settings-menu.tsx:popover-open-change",
					message: "Playback settings popover open state changed",
					data: { open: details.open },
				});
			}}
		>
			<Popover.Trigger asChild>
				<span style={{ display: "inline-flex" }}>
					<ToolbarButton
						tooltip="Playback settings"
						ariaLabel="Playback settings"
					>
						<Icon name="gear" />
					</ToolbarButton>
				</span>
			</Popover.Trigger>

			<Popover.Content
				className={contentWidthStyle}
				onPointerDownCapture={(event: PointerEvent) => {
					const target = event.target as Element | null;

					logPlaybackControlsDebug({
						hypothesisId: "A,B",
						location: "playback-settings-menu.tsx:content-pointerdown",
						message: "Popover content pointerdown captured",
						data: {
							targetTag: target?.tagName,
							targetText: target?.textContent?.trim().slice(0, 80),
							targetAriaLabel: target?.getAttribute("aria-label"),
						},
					});
				}}
			>
				<Popover.Header>Playback Controls</Popover.Header>

				{/* When pressing play section */}
				<Popover.Section>
					<Popover.SectionCard>
						<Popover.SectionLabel>When pressing play</Popover.SectionLabel>
						<Button
							variant="ghost"
							size="sm"
							className={menuItemStyle({
								selected: playMode === "viewOnly",
								disabled: !isViewOnlyAvailable,
							})}
							onClick={() => {
								logPlaybackControlsDebug({
									hypothesisId: "B,C,E",
									location: "playback-settings-menu.tsx:view-only-click",
									message: "View-only play mode click handler invoked",
									data: {
										isViewOnlyAvailable,
										currentPlayMode: playMode,
									},
								});
								isViewOnlyAvailable && setPlayMode("viewOnly");
							}}
							aria-disabled={!isViewOnlyAvailable}
							tooltip={
								!isViewOnlyAvailable
									? "Available when there are computed frames"
									: undefined
							}
						>
							<Icon name="play" className={menuItemIconStyle} size="sm" />
							<span className={menuItemTextStyle}>
								Play computed steps only
							</span>
							{playMode === "viewOnly" && (
								<Icon name="check" className={checkIconStyle} size="sm" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className={menuItemStyle({
								selected: playMode === "computeBuffer",
								disabled: !isComputeAvailable,
							})}
							onClick={() => {
								logPlaybackControlsDebug({
									hypothesisId: "B,C,E",
									location: "playback-settings-menu.tsx:compute-buffer-click",
									message: "Compute-buffer play mode click handler invoked",
									data: {
										isComputeAvailable,
										currentPlayMode: playMode,
									},
								});
								isComputeAvailable && setPlayMode("computeBuffer");
							}}
							aria-disabled={!isComputeAvailable}
							tooltip={
								!isComputeAvailable
									? "Not available when simulation is complete"
									: undefined
							}
						>
							<Icon name="chartLine" className={menuItemIconStyle} size="sm" />
							<span className={menuItemTextStyle}>Play + compute buffer</span>
							{playMode === "computeBuffer" && (
								<Icon name="check" className={checkIconStyle} size="sm" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className={menuItemStyle({
								selected: playMode === "computeMax",
								disabled: !isComputeAvailable,
							})}
							onClick={() => {
								logPlaybackControlsDebug({
									hypothesisId: "B,C,E",
									location: "playback-settings-menu.tsx:compute-max-click",
									message: "Compute-max play mode click handler invoked",
									data: {
										isComputeAvailable,
										currentPlayMode: playMode,
									},
								});
								isComputeAvailable && setPlayMode("computeMax");
							}}
							aria-disabled={!isComputeAvailable}
							tooltip={
								!isComputeAvailable
									? "Not available when simulation is complete"
									: undefined
							}
						>
							<Icon
								name="rightToLine"
								className={menuItemIconStyle}
								size="sm"
							/>
							<span className={menuItemTextStyle}>Play + compute max</span>
							{playMode === "computeMax" && (
								<Icon name="check" className={checkIconStyle} size="sm" />
							)}
						</Button>
						<div className={popoverDividerStyle} />
					</Popover.SectionCard>
				</Popover.Section>

				{/* Playback speed section */}
				<Popover.Section>
					<Popover.SectionCard>
						<Popover.SectionLabel>Playback speed</Popover.SectionLabel>
						{speedRows.map((row) => (
							<div key={row[0]} className={speedGridStyle}>
								{row.map((speed) => (
									<Button
										key={speed}
										variant="ghost"
										size="sm"
										className={speedButtonStyle({
											selected: speed === playbackSpeed,
										})}
										onClick={() => {
											logPlaybackControlsDebug({
												hypothesisId: "B,E",
												location: "playback-settings-menu.tsx:speed-click",
												message: "Playback speed click handler invoked",
												data: {
													requestedSpeed: speed,
													currentPlaybackSpeed: playbackSpeed,
												},
											});
											setPlaybackSpeed(speed);
										}}
									>
										{formatPlaybackSpeed(speed)}
									</Button>
								))}
							</div>
						))}
						<div className={popoverDividerStyle} />
					</Popover.SectionCard>
				</Popover.Section>

				{/* Stopping conditions section */}
				<Popover.Section>
					<Popover.SectionCard>
						<Popover.SectionLabel>Stopping conditions</Popover.SectionLabel>
						<Button
							variant="ghost"
							size="sm"
							className={menuItemStyle({
								selected: stoppingCondition === "indefinitely",
								disabled: hasSimulation,
							})}
							onClick={() => {
								logPlaybackControlsDebug({
									hypothesisId: "B,C,E",
									location: "playback-settings-menu.tsx:indefinite-click",
									message:
										"Indefinite stopping condition click handler invoked",
									data: { hasSimulation, stoppingCondition },
								});
								!hasSimulation && handleStoppingConditionChange("indefinitely");
							}}
							aria-disabled={hasSimulation}
							tooltip={
								hasSimulation
									? "Reset simulation to change stopping conditions"
									: undefined
							}
						>
							<Icon name="infinity" className={menuItemIconStyle} size="sm" />
							<span className={menuItemTextStyle}>Run indefinitely</span>
							{stoppingCondition === "indefinitely" && (
								<Icon name="check" className={checkIconStyle} size="sm" />
							)}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className={menuItemStyle({
								selected: stoppingCondition === "fixed",
								disabled: hasSimulation,
							})}
							onClick={() => {
								logPlaybackControlsDebug({
									hypothesisId: "B,C,E",
									location: "playback-settings-menu.tsx:fixed-click",
									message: "Fixed stopping condition click handler invoked",
									data: { hasSimulation, stoppingCondition },
								});
								!hasSimulation && handleStoppingConditionChange("fixed");
							}}
							aria-disabled={hasSimulation}
							tooltip={
								hasSimulation
									? "Reset simulation to change stopping conditions"
									: undefined
							}
						>
							<Icon name="clock" className={menuItemIconStyle} size="sm" />
							<span className={menuItemTextStyle}>End at fixed time</span>
							{stoppingCondition === "fixed" && (
								<>
									<NumberInput
										size="sm"
										min={0.1}
										step={0.1}
										value={maxTime ?? 10}
										disabled={hasSimulation}
										onChange={(event) => {
											const value = Number.parseFloat(
												(event.target as HTMLInputElement).value,
											);
											if (!Number.isNaN(value) && value > 0) {
												setMaxTime(value);
											}
										}}
										onClick={(event) => event.stopPropagation()}
										className={maxTimeInputStyle}
										aria-label="Maximum simulation time in seconds"
									/>
									<span
										style={{
											fontSize: "12px",
											color: "var(--colors-neutral-s100)",
										}}
									>
										s
									</span>
								</>
							)}
							{stoppingCondition !== "fixed" && (
								<Icon
									name="check"
									className={cx(checkIconStyle, css({ visibility: "hidden" }))}
									size="sm"
								/>
							)}
						</Button>
						<div className={popoverDividerStyle} />
					</Popover.SectionCard>
				</Popover.Section>
			</Popover.Content>
		</Popover.Root>
	);
};
