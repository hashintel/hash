package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.NodeSortOrder
import com.intellij.ide.projectView.NodeSortSettings
import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.util.ui.UIUtil


class ModuleFileNode(project: Project, value: PsiFile, viewSettings: ViewSettings?) :
    PsiFileNode(project, value, viewSettings) {
    override fun update(data: PresentationData) {
        super.update(data)
        presentation.background = UIUtil.getTreeBackground().brighter();
        presentation.presentableText = "../${value.name}"
    }

    override fun getSortOrder(settings: NodeSortSettings): NodeSortOrder = if (settings.isFoldersAlwaysOnTop) {
        NodeSortOrder.PACKAGE
    } else {
        super.getSortOrder(settings)
    }

//    override fun getSortKey(): Comparable<Nothing> {
//        return -2
//    }


    companion object {
        fun fromPsiFileNode(node: PsiFileNode, settings: ViewSettings?): ModuleFileNode {
            node.value.putUserData(ModuleFileNodeMarker, true);
            node.value.putUserData(ModuleFileNodeRecursionMarker, true);
            return ModuleFileNode(node.project, node.value, settings)
        }

        fun wrap(node: PsiFileNode, settings: ViewSettings?) = ModuleFileNode(node.project, node.value, settings);
    }
}