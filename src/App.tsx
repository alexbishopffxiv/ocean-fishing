import React from "react";
import "./App.css";
import { fishData, Route, Fish } from "./fish-data";
import { routeData } from "./route-data";
import { differenceInHours } from "date-fns";
import { baitData } from "./bait-data";
import classNames from "classnames";

const regex = {
  changeFishingArea:
    /^00\|[^|]*\|[^|]*\|Foerzagyl\|Weigh the anchors! Shove off!\|/,
  cast: /^00\|[^|]*\|[^|]*\|\|You cast your line/,
  miss: /^00\|[^|]*\|[^|]*\|\|(Nothing bites\.|You reel in your line|You lose your bait|The fish gets away|You lose your |You cannot carry any more)/,
  mooch:
    /^00\|[^|]*\|[^|]*\|\|You recast your line with the fish still hooked\./,
  quit: /^00\|[^|]*\|[^|]*\|\|(You put away your rod|Fishing canceled)/,
  bite: /^00\|[^|]*\|[^|]*\|\|Something bites/,
};

interface RouteInfo {
  name: string;
  bait: string;
  spectralBait: string;
  targets: Fish[];
}

interface Props {}

interface State {
  castTime: number;
  isOceanFishing: boolean;
  routeInfo: RouteInfo[];
  routeIndex: number;
}

class App extends React.Component<Props, State> {
  isCastInProgress: boolean;
  castStartTime: number;
  isMooch: boolean;
  isDebug: boolean;
  isSpectral: boolean;

  constructor(props: Props) {
    super(props);
    this.isCastInProgress = false;
    this.castStartTime = 0;
    this.isMooch = false;
    this.isSpectral = false;
    this.isDebug =
      new URLSearchParams(window.location.search).get("debug") !== null;

    this.state = {
      castTime: 0,
      isOceanFishing: false,
      routeInfo: this.getCurrentRouteInfo(),
      routeIndex: 0,
    };

    this.registerListeners();
  }

  getRoute() {
    const anchorDate = new Date("November 25, 2021 8:00:00");
    const anchorOffset = 4;

    let interval = differenceInHours(new Date(), anchorDate);
    // Adjustment to show the upcoming route one hour
    // before it starts.
    if (interval % 2 === 1) {
      interval++;
    }

    const routeIndex =
      (Math.floor(interval / 2) + anchorOffset) % routeData.length;
    return routeData[routeIndex];
  }

  getFishData(route: Route, timeOfDay: "day" | "night" | "sunset") {
    const fish = fishData[route];
    const baits = baitData[route];

    let bait = baits.default;
    let spectralBait = baits[timeOfDay];

    let targetFish = [];
    for (const f of fish) {
      if (f.isRecommended && (f.timeOfDay === timeOfDay || !f.timeOfDay)) {
        if (f.isMooch || !(f.isBaitRequired && f.bait !== spectralBait)) {
          targetFish.push(f);
        }
      }
    }

    return {
      targets: targetFish.sort((a, b) => a.minTime - b.minTime),
      name: `${route} (${timeOfDay[0].toUpperCase() + timeOfDay.slice(1)})`,
      bait,
      spectralBait,
    };
  }

  getCurrentRouteInfo() {
    const route = this.getRoute();
    const result = [];
    for (const [name, timeOfDay] of route) {
      result.push(this.getFishData(name, timeOfDay));
    }
    return result;
  }

  registerListeners() {
    // https://ngld.github.io/OverlayPlugin/devs/event_types.html
    // @ts-ignore
    window.addOverlayListener("LogLine", ({ rawLine }) => {
      for (let event in regex) {
        if (regex[event as keyof typeof regex].exec(rawLine)) {
          if (event === "cast" && rawLine.indexOf("spectral current") !== -1) {
            event = "spectralCast";
          }

          switch (event) {
            case "changeFishingArea":
              this.setState({ routeIndex: this.state.routeIndex + 1 });
              break;
            case "cast":
              this.isSpectral = false;
              this.isMooch = false;
              this.startCast();
              break;
            case "spectralCast":
              this.isSpectral = true;
              this.isMooch = false;
              this.startCast();
              break;
            case "mooch":
              this.isMooch = true;
              this.startCast();
              break;
            case "miss":
            case "quit":
            case "bite":
              this.stopCast();
              break;
          }
        }
      }
    });

    // @ts-ignore
    window.addOverlayListener("ChangeZone", ({ zoneID }) => {
      this.setState({ isOceanFishing: zoneID === 384 });
    });

    // @ts-ignore
    window.startOverlayEvents();
  }

  startCast = () => {
    this.isCastInProgress = true;
    this.castStartTime = Date.now();
    this.setState({
      castTime: 0,
    });
    this.cast();
  };

  stopCast = () => {
    this.isCastInProgress = false;
  };

  cast = () => {
    if (!this.isCastInProgress) {
      return;
    }

    this.setState({
      castTime: Number(((Date.now() - this.castStartTime) / 1000).toFixed(1)),
    });

    requestAnimationFrame(this.cast);
  };

  renderDebug() {
    const routes = Object.keys(fishData) as (keyof typeof fishData)[];
    const result = [];
    for (const route of routes) {
      result.push(this.getFishData(route, "day"));
      result.push(this.getFishData(route, "sunset"));
      result.push(this.getFishData(route, "night"));
    }

    return (
      <div>
        {this.state.castTime}
        <button onClick={this.startCast}>Cast</button>
        {result.map((r) => (
          <div key={r.name}>
            <h1>{r.name}</h1>
            {this.renderFishGrid(r)}
          </div>
        ))}
      </div>
    );
  }

  isSelected(fish: Fish) {
    if (!this.isSpectral) {
      return false;
    }

    const lowerBound = fish.minTime - 0.07;
    const upperBound = fish.maxTime - 0.07;
    const currentTime = this.state.castTime;
    return currentTime >= lowerBound && currentTime <= upperBound;
  }

  renderFishGrid(fish: RouteInfo) {
    return (
      <div>
        {fish.targets.map((f) => (
          <div
            key={f.name}
            className={classNames({
              fishRow: true,
              isSelected: this.isSelected(f),
            })}
          >
            <div className="fishTug">{["!", "!!", "!!!"][f.tug - 1]}</div>
            <div className="fishTime">
              {(() => {
                if (f.minTime === f.maxTime) {
                  return f.minTime;
                }
                return `${f.minTime}-${f.maxTime}`;
              })()}
            </div>
            <div className="fishPoints">{f.maxDh * f.points}</div>
            <div className="fishName">{f.name}</div>
          </div>
        ))}
      </div>
    );
  }

  render() {
    if (this.isDebug) {
      return this.renderDebug();
    }

    if (!this.state.isOceanFishing) {
      return <div></div>;
    }

    const routeInfo = this.state.routeInfo[this.state.routeIndex];
    return (
      <div className="App">
        <div className="top">
          <div className="castTime">{this.state.castTime}</div>
          <div>{this.renderFishGrid(routeInfo)}</div>
        </div>
        <div className="bottom">
          <div className="routeName">{routeInfo.name}</div>
          <div>
            {routeInfo.bait} → {routeInfo.spectralBait}
          </div>
        </div>
      </div>
    );
  }
}

export default App;
