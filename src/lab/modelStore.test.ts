import { beforeEach, describe, expect, it } from 'vitest'
import { heart } from '../models/heart/definition'
import { skeleton } from '../models/skeleton/definition'
import { useModel } from './modelStore'

const store = () => useModel.getState()

describe('guided tour', () => {
  beforeEach(() => {
    store().load(heart)
    store().set({ loaded: true })
  })

  it('starts at the first step and applies each step', () => {
    store().startTour()
    expect(store().tourStep).toBe(0)
    expect(store().viewTarget).toEqual({ rotation: heart.initialRotation })

    const token = store().viewToken
    store().stepTour(1)
    const step = heart.tour![1]
    expect(store()).toMatchObject({ tourStep: 1, selected: step.part, viewTarget: { part: step.part } })
    expect(store().viewToken).toBe(token + 1)
  })

  it('sets and clears the cut-away per step', () => {
    store().startTour()
    const i = heart.tour!.findIndex((s) => s.cutaway)
    for (let n = 0; n < i; n++) store().stepTour(1)
    expect(store().cutaway).toBe(heart.tour![i].cutaway)
    store().stepTour(1)
    expect(store().cutaway).toBe(0)
  })

  it('does not step before the first step', () => {
    store().startTour()
    store().stepTour(-1)
    expect(store().tourStep).toBe(0)
  })

  it('finishes after the last step and stops the motion it started', () => {
    store().startTour()
    const n = heart.tour!.length
    for (let i = 1; i < n; i++) store().stepTour(1)
    expect(store().running).toBe(true) // the last heart step plays the heartbeat
    const done = store().toursCompleted
    store().stepTour(1)
    expect(store()).toMatchObject({
      tourStep: null,
      running: false,
      selected: null,
      toursCompleted: done + 1,
    })
  })

  it('leaves motion the student started running', () => {
    store().set({ running: true })
    store().startTour()
    for (let i = 1; i < heart.tour!.length; i++) store().stepTour(1)
    store().endTour()
    expect(store().running).toBe(true)
  })

  it('ends when Study or assembly opens', () => {
    store().startTour()
    store().openStudy('aorta')
    expect(store()).toMatchObject({ tourStep: null, mode: 'study' })

    store().closeStudy()
    store().startTour()
    store().startAssembly()
    expect(store()).toMatchObject({ tourStep: null, mode: 'assembly' })
  })

  it('resets when another model loads', () => {
    store().startTour()
    store().load(skeleton)
    expect(store().tourStep).toBeNull()
  })
})
