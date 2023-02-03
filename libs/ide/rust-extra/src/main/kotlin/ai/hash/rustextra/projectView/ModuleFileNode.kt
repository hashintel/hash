package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.ui.JBColor
import com.intellij.ui.SimpleTextAttributes


class ModuleFileNode(project: Project, value: PsiFile, viewSettings: ViewSettings?) : PsiFileNode(project, value, viewSettings) {

    override fun createPresentation(): PresentationData {
        val previous =  super.createPresentation()
        previous.forcedTextForeground = JBColor.GRAY
        previous.addText("../${value.name}", SimpleTextAttributes.REGULAR_ATTRIBUTES);
        previous.background = JBColor.PanelBackground.brighter()

        return previous
    }

    override fun getWeight(): Int {
        return 0
    }

    override fun getSortKey(): Comparable<Nothing> {
        return -2
    }

    companion object {
        fun fromPsiFileNode(node: PsiFileNode, settings: ViewSettings?): ModuleFileNode {
            node.value.putUserData(ModuleFileNodeMarker, true);
            return ModuleFileNode(node.project, node.value, settings)
        }
    }
}